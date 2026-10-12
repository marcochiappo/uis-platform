-- Mentor recruitment workflow (admin-only).
--
--   * prospects gains provenance, review, enrichment and community-affiliation
--     fields. Confirmed affiliation requires written evidence; unconfirmed
--     signals are stored separately (community_signals) and never derived from names.
--   * outreach_messages: drafts → admin approval → send. A partial unique index
--     allows at most ONE "sending"/"sent" invitation per candidate, so retries and
--     double clicks can't produce duplicate sends.
--   * suppressions: do-not-contact list; enforced again by a trigger at send time.
--   * Public token functions: unsubscribe_by_token (anon) and claim_invitation
--     (signed-in user). Claiming only links the account and marks "joined" — it
--     never creates a mentor profile, an approval, or a match.

-- ------------------------------------------------------------------ prospects

alter table public.prospects
  add column title text check (char_length(title) <= 200),
  add column location text check (char_length(location) <= 200),
  add column source_ref text,
  add column source_detail text check (char_length(source_detail) <= 500),
  add column retrieved_at timestamptz not null default now(),
  add column review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'approved', 'rejected')),
  add column review_note text,
  add column email_status text not null default 'none'
    check (email_status in ('none', 'provided', 'verified', 'unverified', 'unavailable')),
  add column email_source text check (email_source in ('csv', 'apollo', 'apollo_mock', 'manual')),
  add column enrichment_status text not null default 'not_requested'
    check (enrichment_status in ('not_requested', 'found_email', 'no_email', 'no_match', 'error')),
  add column enrichment_error text,
  add column enriched_at timestamptz,
  add column community_affiliation text not null default 'unconfirmed'
    check (community_affiliation in ('unconfirmed', 'confirmed', 'not_affiliated')),
  add column affiliation_evidence text check (char_length(affiliation_evidence) <= 1000),
  add column affiliation_reviewed_by uuid references public.profiles (id) on delete set null,
  add column affiliation_reviewed_at timestamptz,
  add column community_signals jsonb not null default '[]'::jsonb,
  add column do_not_contact boolean not null default false,
  add column joined_user_id uuid references public.profiles (id) on delete set null;

alter table public.prospects
  add constraint prospects_confirmed_needs_evidence
    check (community_affiliation <> 'confirmed' or coalesce(btrim(affiliation_evidence), '') <> ''),
  add constraint prospects_source_check
    check (source in ('csv', 'apollo', 'apollo_mock', 'manual', 'demo-seed'));

-- Pipeline status: enum → text with the new vocabulary.
alter table public.prospects alter column status drop default;
alter table public.prospects alter column status type text using (
  case status::text when 'contacted' then 'invited' when 'registered' then 'joined' else status::text end
);
alter table public.prospects alter column status set default 'new';
alter table public.prospects
  add constraint prospects_status_check check (status in ('new', 'invited', 'interested', 'declined', 'joined')),
  add constraint prospects_joined_needs_account check (status <> 'joined' or joined_user_id is not null);
drop type public.prospect_status;

create unique index prospects_source_ref_unique on public.prospects (source, source_ref) where source_ref is not null;

-- ------------------------------------------------------------------ settings

create table public.outreach_settings (
  id smallint primary key default 1 check (id = 1),
  subject_template text not null check (char_length(subject_template) between 1 and 300),
  body_template text not null check (char_length(body_template) between 1 and 10000),
  batch_limit smallint not null default 10 check (batch_limit between 1 and 50),
  sending_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

-- ------------------------------------------------------------------ messages

create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  recipient text,
  subject text not null check (char_length(subject) <= 300),
  body text not null check (char_length(body) <= 10000),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'sending', 'sent', 'failed', 'bounced', 'mock_logged', 'cancelled')),
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  approved_recipient text,
  approved_hash text,
  invite_token text not null unique check (char_length(invite_token) >= 24),
  unsubscribe_token text not null unique check (char_length(unsubscribe_token) >= 24),
  provider text check (provider in ('resend', 'mock')),
  provider_message_id text unique,
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('approved', 'sending', 'sent') or (approved_by is not null and approved_hash is not null))
);
create index outreach_messages_prospect on public.outreach_messages (prospect_id);
-- Duplicate-send guard: one in-flight or delivered invitation per candidate.
create unique index outreach_one_send_per_prospect
  on public.outreach_messages (prospect_id) where status in ('sending', 'sent');

create trigger outreach_messages_touch before update on public.outreach_messages
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ suppressions

create table public.suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  reason text not null check (reason in ('unsubscribed', 'admin', 'bounced', 'complaint')),
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index suppressions_email_unique on public.suppressions (email);

-- ------------------------------------------------------------------ guards

-- Editing an approved message revokes the approval; sent content is immutable;
-- a message can only start sending if the recipient is still contactable.
create function public.outreach_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  content_changed boolean := new.subject is distinct from old.subject
    or new.body is distinct from old.body or new.recipient is distinct from old.recipient;
begin
  if old.status in ('sending', 'sent', 'bounced', 'mock_logged') and content_changed then
    raise exception 'A sent invitation cannot be edited' using errcode = '42501';
  end if;
  if old.status = 'approved' and new.status = 'approved' and content_changed then
    new.status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
    new.approved_recipient := null;
    new.approved_hash := null;
  end if;
  if new.status = 'sending' and old.status <> 'sending' then
    if new.recipient is null or lower(new.recipient) is distinct from lower(new.approved_recipient) then
      raise exception 'Recipient does not match the approved recipient' using errcode = '42501';
    end if;
    if exists (select 1 from public.suppressions s where s.email = lower(new.recipient))
       or exists (select 1 from public.prospects p where p.id = new.prospect_id and p.do_not_contact) then
      raise exception 'Recipient is on the do-not-contact list' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger outreach_messages_guard before update on public.outreach_messages
  for each row execute function public.outreach_guard();

-- ------------------------------------------------------------------ token functions

create function public.unsubscribe_by_token(p_token text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  m public.outreach_messages;
begin
  if p_token is null or char_length(p_token) < 24 then
    return false;
  end if;
  select * into m from public.outreach_messages where unsubscribe_token = p_token;
  if not found then
    return false;
  end if;
  if m.recipient is not null then
    insert into public.suppressions (email, reason, note)
    values (lower(m.recipient), 'unsubscribed', 'Unsubscribe link')
    on conflict do nothing;
  end if;
  update public.prospects set do_not_contact = true, updated_at = now() where id = m.prospect_id;
  update public.outreach_messages
     set status = 'cancelled', last_error = 'Recipient unsubscribed.'
   where prospect_id = m.prospect_id and status in ('draft', 'approved');
  return true;
end $$;

create function public.claim_invitation(p_token text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m public.outreach_messages;
begin
  if uid is null or p_token is null or char_length(p_token) < 24 then
    return false;
  end if;
  select * into m from public.outreach_messages
   where invite_token = p_token and status in ('sent', 'mock_logged');
  if not found then
    return false;
  end if;
  -- Only links the account. Listing as a mentor still requires a profile,
  -- directory consent and UIS approval.
  update public.prospects
     set joined_user_id = uid, status = 'joined', updated_at = now()
   where id = m.prospect_id and (joined_user_id is null or joined_user_id = uid);
  return found;
end $$;

-- Called by the email webhook with the service role (no user session).
create function public.record_delivery_failure(p_provider_message_id text, p_kind text, p_detail text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  m public.outreach_messages;
begin
  update public.outreach_messages
     set status = 'bounced', last_error = left(p_kind || ': ' || coalesce(p_detail, ''), 500)
   where provider_message_id = p_provider_message_id and status in ('sent', 'bounced')
  returning * into m;
  if not found then
    return false;
  end if;
  if m.recipient is not null then
    insert into public.suppressions (email, reason, note)
    values (lower(m.recipient), case when p_kind = 'complaint' then 'complaint' else 'bounced' end, left(p_detail, 200))
    on conflict do nothing;
  end if;
  return true;
end $$;

-- ------------------------------------------------------------------ RLS & grants

alter table public.outreach_settings enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.suppressions enable row level security;

create policy outreach_settings_admin on public.outreach_settings
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy outreach_messages_admin on public.outreach_messages
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy suppressions_admin on public.suppressions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.outreach_settings, public.outreach_messages, public.suppressions from anon, authenticated;
grant select, insert, update, delete on public.outreach_settings, public.outreach_messages, public.suppressions to authenticated;

revoke execute on function public.outreach_guard() from public, anon, authenticated;
revoke execute on function public.unsubscribe_by_token(text) from public;
revoke execute on function public.claim_invitation(text) from public, anon;
revoke execute on function public.record_delivery_failure(text, text, text) from public, anon, authenticated;
grant execute on function public.unsubscribe_by_token(text) to anon, authenticated;
grant execute on function public.claim_invitation(text) to authenticated;
grant execute on function public.record_delivery_failure(text, text, text) to service_role;
