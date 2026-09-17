# Family Sphere v248 — Events & Reminders instant cross-browser sync

Changes are limited to live shared-state synchronization for Events & Reminders.

- Events rendering no longer mutates shared family state.
- Sync now tracks real queued user edits with a dirty flag instead of treating render-time normalization as an edit.
- Create/Edit/Delete event and Set/Remove reminder force an immediate backend state push.
- Existing v246 live family stream and 2-second fallback polling remain in place.
- Remote state rerenders Events, Dashboard upcoming events, and notifications automatically.
- No new Supabase SQL is required.
- All existing UI and other workflows remain unchanged.
