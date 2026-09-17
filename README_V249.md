# Family Sphere v249 — Dashboard Icons + Reliable Notifications

Changes are intentionally limited to the Dashboard icons and Notifications system.

- Restored dashboard Family Members, Secure Records, Open Help Requests icons with built-in SVGs (no missing MP4 dependency).
- Restored the notification bell with a built-in SVG.
- Notification popup now renders above dashboard cards.
- Notifications are no longer deleted from shared family state when the bell is opened.
- Read/view state is stored per family member in the existing shared `family_states` state.
- Opening/Mark all read is synced across browsers for the same member.
- Other family members keep their own unread state.
- Duplicate notifications are normalized/deduplicated.
- Real family spaces no longer receive demo seed notifications.
- Uses existing Supabase backend and v246+ live family synchronization. No new SQL required.
