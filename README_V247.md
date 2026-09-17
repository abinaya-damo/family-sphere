# Family Sphere v247 — Events & Reminders Shared Backend

Changes are limited to Events & Reminders persistence/sync.

- Events now live in the existing shared family state (`data.events`) instead of browser-only localStorage.
- Reminder settings now live in shared family state (`data.eventReminders`).
- Create, edit, delete, view/details, maps/call and reminder controls remain wired to the existing UI.
- Existing local Events/Reminders are migrated once when a family has no shared event data yet.
- Event records keep compatibility aliases used by the Dashboard (`title/name`, `category/tag`, `location/place`).
- Create/edit/delete/reminder changes call the existing family-state sync, so v246 live sync pushes them to all logged-in members of the same Family ID.
- Remote state updates re-render the upgraded Events UI immediately.
- No new Supabase SQL is required.
