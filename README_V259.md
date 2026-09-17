# Family Sphere v259

Targeted fix only: notifications + event reminder timing.

- Dedicated Supabase notifications table is the source of truth again, eliminating notification loss caused by family-state save races.
- Family posts (chat/help/event/document upload) create notifications for approved family logins.
- Reminder-set notification is personal to the member who set it.
- A 1-hour-before reminder is scheduled for exactly event time minus 1 hour. If that time already passed, the UI asks for a later option instead of showing Due now immediately.
- Viewed notifications disappear from the panel and stay read.
- At reminder trigger time, a fresh Due now notification is created once, with silent browser notification and vibration where supported.
- Reminder check interval is 1 second while the website is open.
- All other UI/backend workflows remain unchanged.

Run `supabase/V259_NOTIFICATION_BACKEND_REPAIR.sql` once in Supabase SQL Editor.
