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

