# Family Sphere v264 — no white launch screen

Built directly from v263.

Changed only the startup visual layer:
- Removed the blank white frame during app/session startup.
- Added an immediate Family Sphere branded launch cover that appears from the first paint.
- The cover disappears automatically as soon as saved-session restore or Login is ready.
- No iframe/Next.js development badge is shown.

Strictly unchanged:
- v259 notification/reminder backend and behavior
- v261 universal multi-browser live sync
- persistent login / page refresh behavior
- all existing Family Sphere UI and workflows

No new Supabase SQL is required.
