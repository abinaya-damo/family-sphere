# Family Sphere v246 — Live cross-browser family sync

Changes are intentionally limited to synchronization behavior. UI and existing workflows are unchanged.

## What changed
- Added authenticated live event stream at `/api/family-sphere?stream=1&familyId=...`.
- Every logged-in browser keeps a live connection to the Family Sphere backend.
- When `family_states.updated_at` changes, connected family members pull the newest shared state immediately.
- Help Board volunteer/cancel/delete/request changes and their in-app notifications therefore appear without manual refresh.
- A 2-second polling fallback remains in case a hosting environment closes the live stream.
- Join-request fallback refresh is 4 seconds.
- Existing editing protection remains: an open form/modal is not overwritten mid-edit; the queued live update is applied as soon as editing finishes.

## Database
No new SQL is required for v246. It uses the existing `family_states` table.
