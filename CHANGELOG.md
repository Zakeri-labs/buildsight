## 2026-10-21 — Design gallery (معرض التصاميم), part 2: public pages

- New public pages, no sign-in needed: **`/designs`** (gallery with search and category filters) and **`/designs/<slug>`** (design page with images, specs and contact buttons). Arabic by default, English with `?lang=en`; the page sets its own language and direction.
- Search works in Arabic and English and tolerates spelling variants (hamza forms, ة/ه, ى/ي, Persian ی/ک, diacritics, Arabic digits).
- Reference-only designs (public, educational) show "Similar project?" instead of booking. A fixed "Have another idea?" card is always last.
- Contact buttons open WhatsApp with a ready message containing the design name, code and link. Until the booking form exists (part 3), "Book a meeting" also opens WhatsApp.
- SEO: title, description, canonical, Arabic/English alternates (hreflang), Open Graph images, and `/designs/sitemap.xml`. A missing or unpublished design shows a not-found page marked `noindex` (HTTP 200, because the app's root loading screen starts streaming before the page decides).
- Which organization's gallery a request shows: the site whose custom host matches the request, else `DESIGN_GALLERY_DEFAULT_SITE` (set it to `bonyan`), else the only enabled gallery.
- Anonymous page views and contact clicks are recorded for the monthly figures (no personal data; bots ignored).
- Admin settings: new "Main website" field. Header logo comes from the gallery settings (Bonyan: `/Logow.png`).
- Shared: `lib/whatsapp.ts` builds WhatsApp links for both the report share and the gallery.
- Environment: add `DESIGN_GALLERY_DEFAULT_SITE=bonyan`.
- Database migration required: execute `scripts/sql/081_design_gallery_public.sql`.

## 2026-10-21 — Design gallery (معرض التصاميم), part 1: catalogue and admin

- New admin page **Design Gallery** (`/design-gallery`, sidebar → Administration, `org_admin` only): turn the gallery on, set the public WhatsApp number and names, add/edit designs in Arabic and English, upload and order images (first image is the cover), publish / move to draft / archive / delete.
- Multi-organization: every table carries `organization_id`; each organization gets its own gallery, slug and categories through `provision_design_gallery`.
- Access: the public reads only published designs of an enabled gallery of an active organization; only the organization's `org_admin` sees drafts. Nobody writes through the API: every change goes through server actions that re-check `org_admin` in the database.
- Rules kept by the database: a published design always has an image (also when two admins act at once), image paths must be inside the design's own folder, and a design can only use its own organization's categories.
- Two admins editing the same design: the second save is refused with a message instead of overwriting the first.
- Demo content for Bonyan: 8 sample designs with images in `public/design-gallery/samples/bonyan`. The seed targets the single active supervising organization named Bonyan (English or Arabic), runs only once, and writes nothing if it can't identify Bonyan.
- Known limits: images stay reachable by URL until deleted, even when a design is unpublished; failed file deletions are logged, not retried.
- Fix (shared): switches in Arabic (RTL) now move their thumb inside the track.
- Tests: `npm test` (Vitest). Database policies are tested against the real migrations with PGlite.
- Database migration required: execute `scripts/sql/079_design_gallery.sql`, then `scripts/sql/080_design_gallery_seed_bonyan.sql`.

## 2026-08-05

- Fixed organization invitation session isolation so signed-out/private browser requests no longer receive a fallback user identity.
- Preserved invitation context through account switching, sign-in, sign-up, and email confirmation, then continued acceptance automatically.
- Added atomic, server-validated invitation acceptance for organization and optional project memberships.
- Database migration required: execute `scripts/sql/050_atomic_invitation_acceptance.sql`.

## 2026-08-03

- Fixed atomic Site Visit scheduling and rescheduling, participant validation, and safe server errors.
- Database migration required: execute `scripts/sql/047_fix_site_visit_scheduling.sql`.

## 2026-08-02

- Replaced the active global Stage library with the required 27-stage construction sequence while preserving legacy project Stage, Term, Sub-term, Report, response, and workflow records.

# Changelog

## Modified files

- `app/(app)/reports/new/page.tsx`
  - Replaced the placeholder with a complete Create Report form.
  - Added required title validation and inline validation feedback.
  - Added drag-and-drop and browse-based attachment selection with support for multiple files.
  - Added selected-file listing and remove actions before submit.
  - Added placeholder submit success feedback and redirect back to `/reports`.

- `CHANGELOG.md`
  - Added a summary of all file changes included in this update.
## Contractor profile prefill
- Prefill Add Project contractor snapshot fields from the selected registered contractor organization.
- Keep all prefilled values editable without modifying the global contractor profile.

