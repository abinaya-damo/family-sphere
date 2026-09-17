# Family Sphere v256 — Notification backend + personal reminder fix

Only the notification/reminder delivery subsystem was changed on top of v255.

## Fixed
- Family activity notifications are stored in Supabase `notifications`, one row per approved family member.
- Notifications live-update across browsers through the existing Family Sphere SSE/live-sync channel.
- Duplicate notification creation is server-side deduplicated for retries/races.
- Unread count comes from the current logged-in user's backend notification rows.
- Opening/reading notifications updates only that user.
- Mark all read updates only that user and persists across refresh/browser sessions.
- Old family-state notification snapshots are no longer the source of truth, so stale notifications do not return.
- Event reminders are stored per family member instead of one shared reminder map.
- Reminder-set and reminder-due notifications are private to only the member who set the reminder.
- Reminder due checks run every 5 seconds while Family Sphere is open.
- Existing v255 Document Vault live sync remains unchanged.

## Database
No new SQL is required if the existing Family Sphere Supabase setup has already been run. The project already contains the `public.notifications` table used by this version.
