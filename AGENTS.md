# AGENTS.md — BuildSight (app.bonyanec.com)

Read this before changing code. The agent and skill files in `.claude/` (implementer, reviewer, tester, task-intake, review-round) build on it.

## Stack
- Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4, shadcn/ui (`components/ui`).
- Supabase: Postgres + Auth + Storage. Server code uses `lib/supabase/server.ts` (RLS-scoped) or `lib/supabase/admin.ts` (service role, always behind an explicit guard from `lib/auth/guards.ts`).
- `middleware.ts` → `lib/supabase/proxy.ts`: signs internal auth headers and redirects signed-out users unless the path is in `PUBLIC_PATHS`.
- i18n: `lib/i18n` (English + Arabic, RTL). New UI text goes into `lib/i18n/dictionaries.ts` for both locales.
- Email: Zoho SMTP via `lib/email`. WhatsApp: click-to-chat links only (`wa.me`); there is no WhatsApp Business API yet.

## Multi-tenancy
- Tenants are `organizations`. The consultancy that runs the platform is the organization with `type = 'supervising'` (`session.supervisingOrg`).
- Organization roles: `org_admin`, `org_manager`, `org_member`, `viewer`. "Admin" in product language means `org_admin` of the organization.
- Every new table that holds business data carries `organization_id` and has RLS. Never hard-code an organization id or name in code; resolve it from the session, the request host, or configuration.

## Database migrations
- Plain SQL in `scripts/sql/NNN_description.sql`, numbered after the highest existing file. They are run by hand in the Supabase SQL editor, in order.
- Write them idempotent (`if not exists`, `drop policy if exists`, `on conflict do nothing`).
- Every migration is listed in `CHANGELOG.md` with "Database migration required: execute `scripts/sql/NNN_….sql`".

## Tests
- Vitest: `npm test` (all), `npx vitest run path/to/file.test.ts` (one file). Tests live next to the code as `*.test.ts`.
- Every fix or behaviour gets a test that fails without it. Pure logic (validation, permissions, URL building, scheduling) is extracted into plain modules so it can be tested without a database.
- Type check: `npx tsc --noEmit`. The repo has pre-existing errors (`next.config.mjs` sets `ignoreBuildErrors`); do not add new ones in touched files.

## Branches and commits
- `main` deploys to production (Vercel). `dev` is the integration branch. Work happens on a task branch cut from `dev`; pull requests target `dev`.
- New commits only: no force-push, no `--no-verify`, no AI mentions in commit messages or authorship.
- Conventional commit style used in this repo: `feat(scope): …`, `fix(scope): …`, `chore(scope): …`, `test(scope): …`.

## Product rules
- Customer data (names, phone numbers, emails, land details) is readable only by the owning organization's authorised roles.
- Public pages (no sign-in) must show only published content of the organization resolved for that request.
- Every UI change must work at 375px width in Arabic (RTL) and English (LTR).

## Modules
- Design gallery (معرض التصاميم): `lib/design-gallery/`, admin UI under `app/(app)/design-gallery`, public pages under `app/designs` (no sign-in; read with the anon key so database policies decide what is public). The organization shown is resolved per request (custom host, else `DESIGN_GALLERY_DEFAULT_SITE`). Spec and acceptance criteria: project doc `bonyan-design-gallery-spec.md`.
