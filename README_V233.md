# Family Sphere v233 — Instant Document Counts + No Login Flash

This update keeps the v232 UI and database design unchanged and fixes two runtime/UI issues.

## Fixes
- Document category counts update immediately after Save record.
- Counts decrease immediately after deleting a record.
- No page refresh is required for count changes.
- The category modal subtitle is refreshed immediately when it is open.
- A saved Supabase session restores the exact last Family Sphere page before the first browser paint.
- Refreshing Document Vault stays on Document Vault without briefly showing Login or Home first.
- Login is still shown normally when there is no valid saved session or access has been revoked.

## Database
No new SQL migration is required if v231 SQL was already run.
