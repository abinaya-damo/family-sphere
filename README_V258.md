# Family Sphere v258 — Notification + Document instant live-sync repair

This build is based on v257 and changes only the notification backend/sync path and the Document Vault live-refresh path.

## Notifications
- Notifications now use a backend-owned ledger stored inside the existing Supabase `family_states` row. This avoids dependency on a separate notification-table setup.
- Family-wide activity creates one notification per approved family login.
- Personal reminders stay private to only the member who set the reminder.
- New notifications are pulled every 1 second as a fallback in addition to the live stream.
- Opening the bell no longer marks everything read automatically.
- Opening one notification marks only that notification read.
- Mark all read persists only for the logged-in user.
- Unread badge/count is based on the logged-in user's backend notification state.
- Old legacy notification-table rows are not used by this version, so they cannot reappear.

## Document Vault
- Documents are refreshed directly from the authoritative Supabase `documents` table.
- The direct refresh runs from live-sync events plus a 1-second fallback check.
- New Property/Identity/Medical/etc. document cards/counts appear without page refresh.
- Document refresh is not blocked by family-state editing/modals.

## Unchanged
UI, Family Tree, Help Board, Events layout/workflow, authentication behavior, dashboard, animations, themes, and all other website functions remain unchanged.

## Supabase
No new SQL is required for v258. Do not reset or rerun the complete database setup.
