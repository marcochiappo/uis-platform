# UIS — United International Society

A platform that connects international students with **mentors** (career and university guidance) and **academic tutors** (subject help). It starts with the Italian community but is built to support more communities later.

Built with Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4 and Supabase (Postgres, Auth, Row Level Security).

## Quick start (demo mode, no credentials)

```sh
npm install
npm run dev        # http://localhost:3000
```

With no Supabase variables set, the app runs in **demo mode**:

- All people and data are **fictional** (`src/lib/data/seed.ts`) and labelled "Fictional demo profile" in the UI.
- Data is stored in `.demo-data/db.json` on the server (gitignored), so changes survive restarts. Admins can reset it from **UIS admin → Overview**.
- Sign-in is a picker of demo accounts (no passwords). You can also create your own demo account.
- **No email is sent.** Messages are recorded in **UIS admin → Email outbox**, marked "Not sent (demo)".

Suggested walkthrough:

1. **Luca Marino** (student) → see a tutoring match with a score breakdown → request an introduction.
2. **Dr. Elena Ricci** (tutor) → accept the request. Her active mentee count goes up.
3. **Chiara Bianchi** (UIS admin) → Requests → *Confirm introduction* → see the email in the outbox.
4. **Giulia Ferri** → the empty state, which explains why no tutor qualifies.
5. **Matteo Conti** → one person who both seeks and offers help.
6. Admin → **Mentor recruitment** → open *Beatrice Santoro* (reviewed, community link confirmed) → *Draft invitation* → *Approve* → *Outreach queue* → *Run MOCK batch*. The message is marked "Mock only, not delivered". Copy its invite token from `.demo-data/db.json` and open `/signup?invite=<token>` to see the invitee side.
7. Admin → Mentor recruitment → *Apollo search* (mock adapter). Add `mock:credits` to the expertise field to see an error.

## Running with Supabase

1. Create a Supabase project (or run `npm run db:start` for a local stack via Docker).
2. Apply the schema: `npx supabase link --project-ref <ref>`, then `npx supabase db push` (local: `npm run db:reset`, which also loads `supabase/seed.sql`).
3. Copy `.env.example` to `.env.local` and set:

   | Variable | Required | Notes |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable (anon) key. Safe in the browser because RLS protects the data |
   | `NEXT_PUBLIC_SITE_URL` | recommended | Fallback origin for confirmation links |
   | `RESEND_API_KEY`, `EMAIL_FROM` | optional | Introduction emails are sent only when both are set |
   | `UIS_DEMO_MODE` | optional | `true` forces demo mode |
   | `APOLLO_API_KEY` | for recruitment | Apollo key scoped to people search and enrichment (or a master key). Without it, search shows "not configured" |
   | `APOLLO_MOCK` | optional | `true` forces the fictional mock adapter |
   | `OUTREACH_FROM_EMAIL`, `OUTREACH_REPLY_TO` | for sending | Sender on a domain verified in Resend (uses `RESEND_API_KEY`) |
   | `OUTREACH_MAX_BATCH` | optional | Hard cap per batch, 1–50 (default 25) |
   | `RESEND_WEBHOOK_SECRET` | for bounces | `whsec_…` signing secret for `/api/webhooks/resend` |
   | `SUPABASE_SECRET_KEY` | for bounces | Server-only. Used **only** by the webhook, which has no user session |

   Everything else runs as the signed-in user, so no secret key is needed for the rest of the app.
4. In Supabase Auth → Email templates → *Confirm signup*, point the link at
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`, and add your site URL to the redirect allow-list.
5. **Create the first admin.** Admin cannot be chosen at sign-up. Sign up normally, then run this in the SQL editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.org';
   ```
6. Never load `supabase/seed.sql` into production. It creates fictional accounts that share the password `uis-demo-password`.

## How it works

### Request lifecycle

```
pending ──mentor accepts──▶ accepted ──UIS confirms──▶ introduced (active match) ──▶ completed
pending → declined (mentor) · pending/accepted → withdrawn (student) · any open → cancelled (UIS)
```

UIS makes every introduction by email. **Contact details are never shown to other members.** Mentors see a student's name, studies, goals and interests, and students see a mentor's public profile. Accepted and introduced requests count towards a mentor's *maximum active mentees*.

### Matching (`src/lib/domain/matching.ts`)

A transparent, rules-based score from 0 to 100. A person appears only if every hard requirement holds:

- **Listed and available:** approved by UIS, consented to the directory, not paused, has capacity, and is not the student themselves.
- **Shared language:** the student's preferred or other languages overlap with the mentor's.
- **Tutoring:** teaches at least one requested subject **and** teaches the student's level.
- **Mentoring:** shares at least one goal **or** career area.

| Tutoring | pts | Mentoring | pts |
| --- | --- | --- | --- |
| Share of requested subjects covered | 40 | Share of goals covered | 30 |
| Teaches the student's level | 15 | Share of career areas covered (shows years of experience) | 25 |
| Language (preferred 15, other shared 8) | 15 | Language | 15 |
| Weekly schedule overlap (4h+ = full points; time zones converted) | 20 | Schedule overlap | 20 |
| Remaining capacity | 10 | Remaining capacity | 10 |

Each match card lists every factor with its points, so the score is exactly the sum shown. If nobody qualifies, the empty state says which requirement ruled people out (for example, "1 tutors your subjects but not at your level") and what the student can change. The server recomputes the match when a request is made, and Postgres re-checks the hard requirements, so a client can't request an incompatible pairing.

### Security model

Permissions are enforced in two independent layers:

1. **Service layer** (`src/lib/services`): every server action re-reads the session and checks the actor. In demo mode this is the enforcement layer.
2. **Postgres** (`supabase/migrations`):
   - RLS on every table; `anon` has no access at all.
   - `profiles` (email, role, LinkedIn) is readable only by its owner and admins.
   - Student profiles are visible to their owner, admins, and mentors the student has contacted.
   - Mentor profiles are visible when approved and listed.
   - `intro_requests` has no write policies; changes go only through the `create_intro_request` / `transition_request` SECURITY DEFINER functions, which mirror `src/lib/domain/requests.ts`.
   - Triggers stop members changing their role, approving themselves or editing capacity counters.
   - New users always get the `member` role, whatever metadata is sent at sign-up.
   - `prospects` is admin-only and is a separate table from registered members, so prospects can never appear as available mentors.

### Mentor recruitment (admin only)

**UIS admin → Mentor recruitment.** Candidates live in `prospects`, which only admins can read. They are not users and never appear to students.

```
search (Apollo, 0 credits) or CSV ──▶ candidate (unreviewed) ──review──▶ approved
   ──enrich (≈1 credit, only if approved, never twice)──▶ email + status
   ──draft from template──▶ edit ──admin approves recipient + exact text──▶ approved message
   ──send batch (limit)──▶ sent / failed / mock_logged ──▶ candidate: invited
   ──invitee signs up via link──▶ joined (account linked only)
   ──completes mentor profile + agrees to be listed + UIS approval──▶ listed mentor
```

- **Sources.** Apollo's official API only: `POST /api/v1/mixed_people/api_search` (0 credits, no emails, partly hidden surnames) and `POST /api/v1/people/match` (work email only; personal emails and phone numbers are never requested). Apollo filters organizations **by domain**, so the "organization" field takes domains. CSV import is for manually selected contacts. Every record keeps its source, external id, search criteria and retrieval date. Nothing is scraped and no LinkedIn activity is automated. A LinkedIn URL is stored only if a source returns it.
- **Community relevance.** Nationality is **never inferred from a name**. Signals derived from location or organization fields, CSV `community_note` and admin notes are stored separately as *unconfirmed signals*, each with its source. Only an admin can set *confirmed*, and the database requires written evidence. Invitations mention the community only when it is confirmed.
- **Templates.** Placeholders are filled only from the candidate record. A missing value becomes `[[MISSING: …]]`, which blocks approval until an admin edits it. `{{signup_link}}` and `{{unsubscribe_link}}` are required and filled at send time.
- **Approval.** Approval stores a hash of the recipient, subject and body. Any edit revokes it, both in the service and in a database trigger. Send-time checks repeat everything: approval hash, recipient, do-not-contact list, review status.
- **Duplicate sends.** An atomic claim (`UPDATE … WHERE status IN ('approved','failed')`) plus a unique index allows **at most one `sending`/`sent` invitation per candidate**. Retries reuse the message id as Resend's `Idempotency-Key`. A send whose outcome wasn't recorded stays `sending` and is never retried automatically: an admin checks the provider dashboard and marks it failed first.
- **Sending is off by default.** Real sending needs `RESEND_API_KEY`, `OUTREACH_FROM_EMAIL` and `NEXT_PUBLIC_SITE_URL`, outside demo mode, **and** an admin switching it on. Otherwise the clearly labelled mock adapter records messages as `mock_logged`, never as sent, and doesn't mark anyone invited. Even live, the app refuses to email mock or demo records and reserved test domains.
- **Do not contact.** The list is checked at draft, approval and send time, and again by a database trigger. Unsubscribe links (`/unsubscribe?t=…`, confirm button) and RFC 8058 one-click (`/api/unsubscribe`) add the address and cancel open drafts. Bounces and complaints from the Resend webhook are recorded as **delivery failures** and suppressed. Replies are never inferred: admins set *interested* or *declined* by hand.
- **Onboarding.** Signing up through an invite link links the account to the candidate and marks them *joined*. That's all: there's no mentor profile, approval, request or match until the person completes a profile, agrees to be listed and passes UIS review.

### Prospect CSV format

```csv
full_name,email,organization,title,location,expertise,linkedin_url,notes,community_note
Ada Example,ada@example.org,Example Labs,Data Scientist,"Milan, Italy",Statistics,https://linkedin.com/in/ada,Met at alumni event,Volunteers with an Italian student group
```

`full_name` (or `name`) is required. Header aliases such as `company`, `role` and `linkedin` are accepted. Limits are 1,000 rows and 1 MB. Duplicate emails are skipped, and invalid rows are reported by line number.

### Internationalisation

UI strings and option labels live in `src/lib/i18n/en.ts`, typed as `Messages`. To add Italian, create `it.ts` satisfying `Messages` and register it in `src/lib/i18n/index.ts`. Stored values are language-neutral keys (for example `career_direction`, `it`).

## Scripts

```sh
npm run dev               # dev server
npm run build && npm start
npm test                  # vitest: matching, states, permissions, recruitment, RLS (PGlite)
npm run typecheck
npm run lint
npm run check             # all three
npm run db:seed:generate  # regenerate supabase/seed.sql from src/lib/data/seed.ts
```

`tests/db` runs the real migrations and seed in [PGlite](https://pglite.dev) (Postgres in WebAssembly) with a stand-in for Supabase's `auth` schema. RLS, triggers and RPCs are tested without Docker.

## Project layout

```
src/app/                 routes and server actions (actions.ts, recruitment-actions.ts)
src/lib/recruitment/     Apollo adapter (live + MOCK), email senders (Resend + MOCK), webhook verification
src/components/          UI (forms, dashboards, admin)
src/lib/domain/          pure logic: matching, schedule, request states, validation, CSV
src/lib/services/        authorization and use cases
src/lib/data/            DataStore interface, demo store, Supabase store, fictional seed
src/lib/i18n/            message catalogs
supabase/migrations/     schema, RLS, triggers, RPCs
tests/                   unit, service and database tests
```

## Remaining integration work (recruitment)

- **Apollo:** create a key scoped to `mixed_people/api_search` and `people/match` and check your plan's credits and rate limits (documented at 600 calls/hour for these endpoints). Apollo doesn't document an out-of-credits error code; the app treats HTTP 402 or any error mentioning "credit" (observed as a 422 "You are out of credits") as credit exhaustion, so confirm this against your account. Review Apollo's terms for outreach use.
- **Resend:** verify the sending domain (SPF/DKIM/DMARC), set `OUTREACH_FROM_EMAIL`, then add a webhook for `email.bounced` and `email.complained` pointing at `/api/webhooks/resend`, with `RESEND_WEBHOOK_SECRET`. In Supabase mode the webhook also needs `SUPABASE_SECRET_KEY`.
- **Legal/compliance (UIS decision):** a lawful basis for contacting people (e.g. legitimate interest under GDPR for EU/UK contacts), a privacy notice link in the template, sender identity and postal address where required (e.g. CAN-SPAM), and retention rules for candidates who never respond.
- **Not built yet:** automatic reply detection (deliberately manual), scheduled sending, multi-step follow-ups, and a UI to export or erase a candidate's data on request (admins can mark do-not-contact; deleting needs SQL).

## Not in this version

- Payments, messaging, scheduling and video calls.
- Admin role management in the UI (use SQL for now).
- Email notifications other than the introduction email.
- Italian translation (the structure is ready).
