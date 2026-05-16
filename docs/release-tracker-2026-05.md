# Project Price Release Tracker (May 2026)

Purpose: single source of truth for release-scope changes before full testing.
Owners: You + Copilot
Scope: current release hardening and admin visibility updates.

## Verification Stamp
- Last verified date: 2026-05-15
- Last verified by: Copilot + user
- Last verification note: Added rollout readiness map and binary-vs-live split tracking.
- Update rule: refresh this block on every release-scope change.

## Release Status
- Overall status: In progress (pre-full-testing)
- Test mode: limited/manual validation only
- Full update testing: not started

## Mobile Binary Status vs Live Enhancements
- Confirmed pattern (last few weeks): many backend/web/admin enhancements shipped while app-store binaries were not recreated each time.
- Most recent explicit app version bump in git history: 2026-04-28 (0.1.1).
- Practical impact:
  - Backend, Netlify function, Supabase migration, and web/admin changes can go live immediately after deploy.
  - Mobile behavior changes in app code require a new iOS/Android build + store propagation before end users receive them.

## Rollout Readiness Map

### Live Now (No App Rebuild Required)
- Web visitor tracking ingest and admin KPI metrics (PP-RLS-001).
- Homeowner projects admin viewer endpoint and modal (PP-RLS-002).
- Database migrations and API policy/GRANT updates for analytics/events.
- Admin dashboard UX/data export enhancements from recent backend/web commits.

### Requires New iOS/Android Binary
- Mobile save/generate flow behavior from apps/mobile code (including rendered image payload behavior).
- Mobile endpoint, timeout, retry, and payload handling improvements committed in app code.
- Any UI/UX changes visible only inside native mobile app screens.

### Next App Rollout Gate
- Build from current main and publish iOS + Android versions.
- Validate one new project save per platform confirms both photo_url and rendered_photo_url.
- Confirm admin modal, homeowner My Projects, and CSV alignment after binary propagation.

## Change Log

### PP-RLS-001 | 2026-05-15 - Web Visitor Tracking + Admin Metrics
- Added first-party web visit ingest endpoint.
- File: backend/functions/project-price-web-visit.js
- Added client tracker script and injected into public pages.
- File: web/public/visitor-tracker.js
- Added Supabase migration for web page events.
- File: supabase/migrations/20260506_web_page_events.sql
- Added admin API metrics for 30-day web visits and unique visitors.
- File: backend/functions/project-price-admin.js
- Added dashboard KPI cards and display wiring.
- File: web/public/admin.html
- Validation status: Completed (manual checks passed)

### PP-RLS-002 | 2026-05-15 - Homeowner Project Viewer in Admin
- Added endpoint to fetch homeowner projects with before/after image fields.
- File: backend/functions/project-price-homeowner-projects.js
- Added "View All Projects" action and modal project gallery in admin.
- File: web/public/admin.html
- Added before/after image rendering in modal (before image confirmed working).
- File: web/public/admin.html
- Validation status: Partially complete (rendered image URL population issue identified)

### PP-RLS-003 | 2026-05-15 - Rendered Image Persistence Hardening
- Root issue observed: rendered_photo_url often empty because rendered image payload is not always present at save time.
- Existing path confirmed:
  - Mobile sends renderedImageBase64/renderedMimeType when available.
  - Save function accepts and writes rendered_photo_url.
  - Files:
    - apps/mobile/lib/price_project_screen.dart
    - backend/functions/project-price-save-project.js
- New hardening change added:
  - Save-time backend fallback now attempts to generate rendered image via Gemini when payload is missing.
  - If generated, uploads to Storage and patches projects.rendered_photo_url.
  - Added lightweight fallback logging for model attempts/success.
  - File: backend/functions/project-price-save-project.js
- Validation status: Code-level validation complete (no lint/syntax errors in edited function), full E2E validation pending

## Pending Before Full Testing
- Deploy latest backend function updates (including save fallback).
- Run one-pass go-live validation checklist (iOS + Android + admin + CSV).
- Confirm rendered_photo_url population for new projects from both platforms.

## Risks / Watch Items
- Mobile builds installed on devices may predate rendered payload logic.
- generate-estimates endpoint is protected by shared secret; direct unauthenticated probes return 401.
- If Gemini image model availability changes, fallback may skip generation and keep save non-fatal.

## Decision Log
- 2026-05-15: Deferred full update testing until additional refinement completed.
- 2026-05-15: Implemented backend fallback to reduce dependency on mobile build freshness.

## Next Entry Template (copy/paste)
### PP-RLS-XXX | YYYY-MM-DD - Short Change Title
- Change:
- Files:
  - path/to/file
- Why:
- Validation:
- Result:
- Follow-up:
