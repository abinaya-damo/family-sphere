# Family Sphere v275 — Dashboard Upcoming uses live Events data only

Built directly from v274.

Fixed only Dashboard > Upcoming:
- Dashboard Upcoming no longer shows deleted/default old demo events.
- It now reads the same live `data.events` used by Events & Reminders.
- Events are ordered strictly by nearest upcoming date/time.
- Past/deleted events are excluded.
- Shows up to 5 nearest events.
- Today/Tomorrow/date labels and time/location come from the actual event record.
- If an event is created/edited/deleted in Events & Reminders, Dashboard Upcoming reflects that same event data on the next render/live sync.

Strictly unchanged:
- Events & Reminders page workflow/buttons/reminders
- v274 password change across browsers
- v273 confirmed removal warning logic
- v272 Family Tree zoom/pan/profile drag
- Family Circle
- notifications/reminders backend
- universal multi-browser live sync
- startup animation/session restore
- Vault, Help Board, Account, and all other UI/workflows

No new Supabase SQL is required.
