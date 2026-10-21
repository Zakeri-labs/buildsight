## 2026-10-21 — Design gallery (معرض التصاميم), part 3: booking a meeting

- New public page **`/designs/book`** (no sign-in, not indexed): a two-step form. Step 1: name, WhatsApp, project type, land status, wilayat (Oman's 61 wilayat, or another place), land area, when to start; for "Have another idea?" also a description and up to 3 images or PDFs (10 MB each). Step 2: online (Google Meet), at the office, or "call me", then a free day and time.
- "Book a meeting", "I want a design in this style", "I want it with changes" and the "Have another idea?" card now open this form instead of WhatsApp (their clicks are still counted for the monthly figures). "Ask on WhatsApp" stays. Reference projects cannot be booked.
- WhatsApp numbers: an 8-digit Omani number gets 968; other numbers must start with their country code (a local "050…" is refused, since WhatsApp could not open it).
- Free times follow the gallery's settings (default Sunday–Thursday 09:00–17:00 Asia/Muscat, 45-minute meetings, at least 12 hours ahead, up to 3 weeks). Booked meetings are not offered again; if two people pick the same time at once, the database lets only one through and the other is asked to choose again.
- An online meeting needs an email: with Google Calendar connected, the meeting is added to the team calendar with a Meet link and the client gets the invitation (office meetings: an invitation without Meet, if the client gave an email). If the calendar is not connected or fails, the request is still saved and the requests page shows why.
- Protection: a double click or retry is one request; a hidden field and a minimum time on the form catch bots; at most 5 requests per address in 10 minutes (per server instance) and 3 per WhatsApp number a day; uploaded files must really be images or PDFs, files the visitor removed are deleted, and a file that cannot be read at that moment is kept and the visitor is asked to send again.
- A request keeps the design's code and title, so a design with bookings can still be deleted.
- Admin: new "Meeting times" card on `/design-gallery` (working days, hours, meeting length, notice, how far ahead, time zone, office address) and a **Meeting requests** page (`/design-gallery/requests`) with the design, land details, start, files (links valid for one hour) and a WhatsApp button. Changing statuses comes with part 4.
- Notifications: each new request appears in the bell of the organization's admins (`org_admin`) only, and opens the request.
- A design can no longer use the address `book` (it is the form's address); an existing one is renamed `book-design` by the migration.
- Known limits: files uploaded in a form that is never sent stay in the private bucket until a cleanup job exists (part 4); two bookings made at the same moment are kept apart only when they start at the same time (enough while all meetings have the same length).
- Environment (optional, for Google Calendar): `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`. Without them bookings work without calendar events.
- Database migration required: execute `scripts/sql/084_design_meeting_requests.sql`.

## 2026-10-21 — Design gallery: a wrong DESIGN_GALLERY_DEFAULT_SITE no longer hides the gallery

- Fix: with `DESIGN_GALLERY_DEFAULT_SITE=bonyan` but the gallery's slug being `provision-consultancy`, `/designs` answered not found. If the variable names no enabled gallery, the gallery marked as default in the database is shown, and the mismatch is logged. The variable is optional; leave it unset unless a deployment must show a different gallery.

## 2026-10-21 — Design gallery: first gallery is the default; demo designs on demand

- Fix: a gallery set up from the admin panel was never the default, so `/designs` showed "not found" until someone marked it in the database. Now the first gallery set up becomes the default automatically, and an existing single gallery is repaired by the migration.
- `add_design_gallery_samples(organization_id)` adds the 8 demo designs (with bundled images, published) to an organization's gallery if it has none yet. The 080 seed only recognized organizations named Bonyan/بنيان; this works for any organization.
- Database migration required: execute `scripts/sql/083_design_gallery_first_default_and_samples.sql`.

## 2026-10-21 — Design gallery: default gallery stored in the database

- Fix: `/designs` showed "not found" on deployments without `DESIGN_GALLERY_DEFAULT_SITE` (e.g. Vercel previews). The default gallery is now marked in the database (`is_default`, Bonyan); the environment variable is optional and still wins when set.
- When no gallery matches, the server log says why (host, enabled galleries, environment variable, database default).
- Database migration required: execute `scripts/sql/082_design_gallery_default_site.sql`.

## 2026-10-21 — Design gallery (معرض التصاميم), part 2: public pages

- New public pages, no sign-in needed: **`/designs`** (gallery with search and all category filters) and **`/designs/<slug>`** (design page with images, specs and contact buttons). Arabic by default, English with `?lang=en`; the page sets its own language and direction (after the page loads; the first HTML still says `lang="en"`).
- Search works in Arabic and English: spelling variants (hamza forms, ة/ه, ى/ي, Persian ی/ک, diacritics, Arabic digits), the Arabic article and attached letters (الفيلا، بالمسبح، وملاعب), simple English plurals, word starts only, and exact design codes (BD-101 or bd101, never BD-1010). Single letters are ignored.
- Reference-only designs (public, educational) show "Similar project?" instead of booking. A fixed "Have another idea?" card is always last.
- Contact buttons open WhatsApp with a ready message containing the design name, code and link. Until the booking form exists (part 3), "Book a meeting" also opens WhatsApp.
- SEO: title, description, canonical (category pages keep their category; searches are `noindex`), Arabic/English alternates, Open Graph images, and `/designs/sitemap.xml`. A missing or unpublished design answers **404**; a database failure answers **500** with a bilingual error page.
- To make real 404/500 answers possible, the thin loading bar that sat at the app root now lives in `auth`, `invite`, `onboarding` and `owner` (the signed-in app keeps its own loading screen).
- Which organization's gallery a request shows: the site whose custom host matches the request, else `DESIGN_GALLERY_DEFAULT_SITE`. Absolute links (canonical, sitemap, shared links) come from the custom host or the configured app URL, never from the request's Host header.
- Anonymous page views and contact clicks are recorded for the monthly figures: no personal data; bots, scripts and other sites are ignored; at most 30 events a minute per address (per server instance); contact types must fit the design.
- Fix (shared): signed-out visitors are now sent to the login page for every app page. Public paths match whole segments, so `/d` and `/r` no longer make `/dashboard`, `/documents`, `/reports`, `/report-entry` or `/rfi` public.
- Public pages allow zooming.
- Admin settings: new "Main website" field. The header logo is stored in the gallery settings (set for Bonyan by the migration; there is no admin field for it yet).
- `lib/whatsapp.ts` builds WhatsApp links for the report share and the gallery (other screens still build their own).
- Environment: add `DESIGN_GALLERY_DEFAULT_SITE=bonyan`. `NEXT_PUBLIC_SITE_URL` must be set for canonical links and the sitemap.
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

