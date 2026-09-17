# Family Sphere v260 — Stable page restore + universal live sync

Built directly on the working v259 notification/reminder baseline.

## Fixed
- Refreshing a logged-in browser stays on the exact current section with no Family Tree/Login flash.
- Opening the website as a fresh navigation still starts at Family Tree.
- Shared family-state changes push in ~90 ms instead of waiting 500 ms.
- Family-state SSE remains primary, with a 900 ms fallback poll for all shared sections.
- An open modal no longer freezes live sync.
- A remote update arriving while somebody is actively typing is deferred safely until blur; it is never treated as a local change and never pushes stale data back to Supabase.
- Tree, Help Board, Events & Reminders shared state, dashboard counts/upcoming items, and other shared family-state views rerender from the newest backend snapshot.
- Document Vault keeps its dedicated authoritative documents-table live sync.
- Notification/reminder backend from v259 is untouched.

## Database
No new SQL is required for v260. Keep the v259 notification SQL already applied.
