Family Sphere v240 — Help Board Button + Backend Repair

Only Help Board behavior was changed from v239.

Fixes:
- Keeps the original/correct Help Board card alignment.
- I can help works through a stable delegated click handler.
- Cancel help works after every rerender.
- Delete request works after every rerender.
- Request help remains connected to the existing modal/form.
- Remote Help cards no longer silently fall back to incompatible local handlers.
- Backend health is rechecked when a valid saved Supabase session exists.
- Volunteering no longer depends on a database upsert conflict constraint; cancelled volunteer rows can be reactivated safely.
- Cross-browser Help Board refresh remains enabled.

Backend:
Run supabase/V240_HELP_BOARD_BACKEND_REPAIR.sql once for an existing database.
