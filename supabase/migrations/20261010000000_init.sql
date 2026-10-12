-- UIS mentoring & tutoring platform — initial schema.
--
-- Security model
--   * Every table has Row Level Security enabled. The `anon` role has no access.
--   * `profiles` (email, role, LinkedIn) is private: owner + UIS admins only.
--   * Approved, consenting mentor/tutor profiles are readable by signed-in users.
--   * Student profiles are readable by their owner, admins, and mentors the
--     student has sent a request to.
--   * Introduction requests can only be created/changed through the
--     SECURITY DEFINER functions below, which mirror src/lib/domain/requests.ts.
--   * Roles are never read from sign-up metadata; only an admin (or the
--     database owner, e.g. in the SQL editor) can grant `admin`.
--   * `prospects` are admin-only and live in their own table, so they can never
--     appear as available mentors.

-- ------------------------------------------------------------------ types

create type public.app_role as enum ('member', 'admin');
create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.service_type as enum ('mentoring', 'tutoring');
create type public.seeking_preference as enum ('mentoring', 'tutoring', 'both');
create type public.teaching_level as enum ('high_school', 'undergraduate', 'graduate');
create type public.request_status as enum
  ('pending', 'accepted', 'declined', 'withdrawn', 'introduced', 'completed', 'cancelled');
create type public.prospect_status as enum ('new', 'contacted', 'invited', 'declined', 'registered');

-- ------------------------------------------------------------------ tables

create table public.communities (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);
insert into public.communities (id, name) values ('italian', 'Italian community');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 100),
  role public.app_role not null default 'member',
  community_id text not null default 'italian' references public.communities (id),
  linkedin_url text check (linkedin_url is null or linkedin_url ~* '^https://([a-z]{2,3}\.)?linkedin\.com/'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 100),
  university text not null check (char_length(university) between 1 and 120),
  degree text not null check (char_length(degree) between 1 and 120),
  degree_level public.teaching_level not null,
  study_year smallint check (study_year between 1 and 10),
  preferred_language text not null,
  languages text[] not null default '{}',
  time_zone text not null,
  goals text[] not null default '{}',
  interests text[] not null default '{}',
  seeking public.seeking_preference not null,
  subjects text[] not null default '{}',
  career_areas text[] not null default '{}',
  availability text[] not null default '{}' check (cardinality(availability) > 0),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 100),
  headline text not null default '' check (char_length(headline) <= 140),
  bio text not null check (char_length(bio) between 1 and 1500),
  expertise text[] not null default '{}',
  offers_mentoring boolean not null default false,
  offers_tutoring boolean not null default false,
  tutoring_subjects text[] not null default '{}',
  teaching_levels public.teaching_level[] not null default '{}',
  mentoring_topics text[] not null default '{}',
  career_areas text[] not null default '{}',
  career_experience text not null default '' check (char_length(career_experience) <= 1500),
  years_experience smallint not null default 0 check (years_experience between 0 and 70),
  languages text[] not null check (cardinality(languages) > 0),
  time_zone text not null,
  availability text[] not null default '{}' check (cardinality(availability) > 0),
  max_active_mentees smallint not null default 3 check (max_active_mentees between 1 and 50),
  directory_consent boolean not null default false,
  is_paused boolean not null default false,
  review_status public.review_status not null default 'pending',
  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  active_count integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (offers_mentoring or offers_tutoring)
);

create table public.intro_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  provider_id uuid not null references public.profiles (id) on delete cascade,
  service public.service_type not null,
  message text not null default '' check (char_length(message) <= 1000),
  status public.request_status not null default 'pending',
  match_score smallint check (match_score between 0 and 100),
  match_reasons text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  introduced_at timestamptz,
  closed_at timestamptz,
  check (student_id <> provider_id)
);
create unique index intro_requests_one_open
  on public.intro_requests (student_id, provider_id, service)
  where status in ('pending', 'accepted', 'introduced');
create index intro_requests_student on public.intro_requests (student_id);
create index intro_requests_provider on public.intro_requests (provider_id);

create table public.request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.intro_requests (id) on delete cascade,
  from_status public.request_status,
  to_status public.request_status not null,
  actor_id uuid references public.profiles (id) on delete set null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index request_events_request on public.request_events (request_id);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text,
  organization text,
  expertise text,
  linkedin_url text,
  notes text,
  source text not null default 'csv',
  status public.prospect_status not null default 'new',
  imported_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index prospects_email_unique on public.prospects (lower(email)) where email is not null;

-- ------------------------------------------------------------------ helpers

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- True when the statement comes from an API user (not the DB owner / service role).
create function public.is_api_user()
returns boolean
language sql stable
as $$
  select current_user in ('authenticated', 'anon');
$$;

create function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger student_profiles_touch before update on public.student_profiles
  for each row execute function public.touch_updated_at();
create trigger provider_profiles_touch before update on public.provider_profiles
  for each row execute function public.touch_updated_at();
create trigger prospects_touch before update on public.prospects
  for each row execute function public.touch_updated_at();

-- New auth user → private profile. The role is ALWAYS 'member'; sign-up
-- metadata is only used for the display name.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users may edit their own name / LinkedIn, but not role, email, community or demo flag.
create function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if public.is_api_user() and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only UIS administrators can change roles' using errcode = '42501';
    end if;
    new.email := old.email;
    new.community_id := old.community_id;
    new.is_demo := old.is_demo;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

create function public.protect_student_columns()
returns trigger language plpgsql as $$
begin
  if public.is_api_user() then
    new.is_demo := case when tg_op = 'UPDATE' then old.is_demo else false end;
  end if;
  return new;
end $$;

create trigger student_profiles_protect before insert or update on public.student_profiles
  for each row execute function public.protect_student_columns();

-- Review status, capacity counters and demo flags are server-controlled.
-- Re-submitting a rejected profile puts it back in the review queue.
create function public.protect_provider_columns()
returns trigger language plpgsql as $$
begin
  if not public.is_api_user() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.review_status := 'pending';
    new.review_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.active_count := 0;
    new.is_demo := false;
    return new;
  end if;
  new.active_count := old.active_count;
  new.is_demo := old.is_demo;
  if public.is_admin() and new.user_id <> auth.uid() then
    -- Admins reviewing someone else's profile may set review fields.
    if new.review_status is distinct from old.review_status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    return new;
  end if;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  if old.review_status = 'rejected' then
    new.review_status := 'pending';
    new.review_note := null;
  else
    new.review_status := old.review_status;
    new.review_note := old.review_note;
  end if;
  return new;
end $$;

create trigger provider_profiles_protect before insert or update on public.provider_profiles
  for each row execute function public.protect_provider_columns();

-- Keep provider_profiles.active_count = number of accepted/introduced requests.
create function public.refresh_active_count()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  pid uuid := coalesce(new.provider_id, old.provider_id);
begin
  update public.provider_profiles
     set active_count = (
       select count(*) from public.intro_requests
        where provider_id = pid and status in ('accepted', 'introduced'))
   where user_id = pid;
  return null;
end $$;

create trigger intro_requests_active_count
  after insert or update of status or delete on public.intro_requests
  for each row execute function public.refresh_active_count();

-- ------------------------------------------------------------------ request RPCs

create function public.create_intro_request(
  p_provider uuid,
  p_service public.service_type,
  p_message text,
  p_score integer,
  p_reasons text[]
) returns public.intro_requests
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s public.student_profiles;
  p public.provider_profiles;
  req public.intro_requests;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select * into s from public.student_profiles where user_id = uid;
  if not found then
    raise exception 'Complete your student profile first' using errcode = '42501';
  end if;
  if uid = p_provider then
    raise exception 'You cannot request yourself' using errcode = '22023';
  end if;
  if s.seeking::text <> 'both' and s.seeking::text <> p_service::text then
    raise exception 'Your profile does not seek this service' using errcode = '22023';
  end if;

  select * into p from public.provider_profiles where user_id = p_provider for update;
  if not found or p.review_status <> 'approved' or not p.directory_consent or p.is_paused
     or p.active_count >= p.max_active_mentees then
    raise exception 'This mentor is not accepting requests' using errcode = 'P0001';
  end if;

  -- Hard requirements (mirror src/lib/domain/matching.ts).
  if not (p.languages && (array[s.preferred_language] || s.languages)) then
    raise exception 'No shared language' using errcode = '22023';
  end if;
  if p_service = 'tutoring' then
    if not p.offers_tutoring or not (p.tutoring_subjects && s.subjects)
       or not (s.degree_level = any (p.teaching_levels)) then
      raise exception 'Tutoring requires a shared subject at your level' using errcode = '22023';
    end if;
  else
    if not p.offers_mentoring
       or not ((p.mentoring_topics && s.goals) or (p.career_areas && s.career_areas)) then
      raise exception 'Mentoring requires a shared goal or career area' using errcode = '22023';
    end if;
  end if;

  insert into public.intro_requests (student_id, provider_id, service, message, match_score, match_reasons)
  values (uid, p_provider, p_service, left(coalesce(p_message, ''), 1000),
          greatest(0, least(100, coalesce(p_score, 0))), coalesce(p_reasons[1:10], '{}'))
  returning * into req;

  insert into public.request_events (request_id, from_status, to_status, actor_id)
  values (req.id, null, 'pending', uid);
  return req;
end $$;

create function public.transition_request(
  p_request uuid,
  p_to public.request_status,
  p_note text default null
) returns public.intro_requests
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.intro_requests;
  admin boolean := public.is_admin();
  allowed boolean := false;
  p public.provider_profiles;
  old_status public.request_status;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select * into r from public.intro_requests where id = p_request for update;
  if not found or not (r.student_id = uid or r.provider_id = uid or admin) then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  old_status := r.status;

  allowed := case
    when r.status = 'pending'    and p_to = 'accepted'   then r.provider_id = uid
    when r.status = 'pending'    and p_to = 'declined'   then r.provider_id = uid
    when r.status = 'pending'    and p_to = 'withdrawn'  then r.student_id = uid
    when r.status = 'accepted'   and p_to = 'withdrawn'  then r.student_id = uid
    when r.status = 'accepted'   and p_to = 'introduced' then admin
    when r.status = 'introduced' and p_to = 'completed'  then admin or r.provider_id = uid
    when r.status in ('pending', 'accepted', 'introduced') and p_to = 'cancelled' then admin
    else false
  end;
  if not allowed then
    raise exception 'Transition % -> % not allowed', r.status, p_to using errcode = '42501';
  end if;

  if p_to = 'accepted' then
    select * into p from public.provider_profiles where user_id = r.provider_id for update;
    if p.active_count >= p.max_active_mentees then
      raise exception 'Mentor is at maximum capacity' using errcode = 'P0001';
    end if;
  end if;

  update public.intro_requests
     set status = p_to,
         updated_at = now(),
         responded_at = case when r.status = 'pending' and p_to in ('accepted', 'declined') then now() else responded_at end,
         introduced_at = case when p_to = 'introduced' then now() else introduced_at end,
         closed_at = case when p_to in ('declined', 'withdrawn', 'completed', 'cancelled') then now() else closed_at end
   where id = p_request
  returning * into r;

  insert into public.request_events (request_id, from_status, to_status, actor_id, note)
  values (r.id, old_status, p_to, uid, left(p_note, 500));
  return r;
end $$;

-- ------------------------------------------------------------------ RLS

alter table public.communities enable row level security;
alter table public.profiles enable row level security;
alter table public.student_profiles enable row level security;
alter table public.provider_profiles enable row level security;
alter table public.intro_requests enable row level security;
alter table public.request_events enable row level security;
alter table public.prospects enable row level security;

create policy communities_read on public.communities
  for select to authenticated using (true);

create policy profiles_select on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

create policy student_select on public.student_profiles
  for select to authenticated using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or exists (
      select 1 from public.intro_requests r
       where r.student_id = student_profiles.user_id and r.provider_id = (select auth.uid()))
  );
create policy student_insert on public.student_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy student_update on public.student_profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy student_delete on public.student_profiles
  for delete to authenticated using (user_id = (select auth.uid()));

create policy provider_select on public.provider_profiles
  for select to authenticated using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (review_status = 'approved' and directory_consent)
    or exists (
      select 1 from public.intro_requests r
       where r.provider_id = provider_profiles.user_id and r.student_id = (select auth.uid()))
  );
create policy provider_insert on public.provider_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy provider_update on public.provider_profiles
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
create policy provider_delete on public.provider_profiles
  for delete to authenticated using (user_id = (select auth.uid()));

-- No insert/update/delete policies: changes go through the RPCs above.
create policy requests_select on public.intro_requests
  for select to authenticated using (
    student_id = (select auth.uid()) or provider_id = (select auth.uid()) or (select public.is_admin())
  );

create policy request_events_select on public.request_events
  for select to authenticated using (
    exists (select 1 from public.intro_requests r where r.id = request_events.request_id)
  );

create policy prospects_admin on public.prospects
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ------------------------------------------------------------------ grants

-- Supabase grants broad default privileges on new public tables; start from zero.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on public.communities to authenticated;
grant select, update (full_name, linkedin_url) on public.profiles to authenticated;
grant select, insert, update, delete on public.student_profiles to authenticated;
grant select, insert, update, delete on public.provider_profiles to authenticated;
grant select on public.intro_requests to authenticated;
grant select on public.request_events to authenticated;
grant select, insert, update, delete on public.prospects to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_api_user() to authenticated;
grant execute on function public.create_intro_request(uuid, public.service_type, text, integer, text[]) to authenticated;
grant execute on function public.transition_request(uuid, public.request_status, text) to authenticated;
