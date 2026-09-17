# Family Sphere v276 — Dashboard Upcoming exact Events & Reminders mirror

Built directly from v275.

Root cause fixed:
- Dashboard HTML itself still contained hard-coded Grandma health check / Family video call / Arjun birthday rows.
- The previous renderer targeted #upcomingList, but the real Dashboard container is #eventList.
- Legacy sortedEvents() also injected default events.
- The V158 event migration could seed demo events into an empty event list.

v276 now guarantees:
1. Dashboard Upcoming reads only the current shared `data.events` used by Events & Reminders.
2. No hard-coded/default/demo events are injected into Dashboard Upcoming.
3. Deleted and past events are excluded.
4. Remaining events are sorted by nearest upcoming date/time.
5. Today / Tomorrow / future date labels are calculated from the actual event.
6. Actual title, time, location, and category are shown.
7. Maximum 5 nearest upcoming events.
8. Create/edit/delete in Events & Reminders refreshes Dashboard Upcoming.
9. Remote/live-sync updates call the same renderer, so all logged-in browsers receive the same Dashboard Upcoming list.

Strictly unchanged:
- Events & Reminders UI/buttons/reminders
- notification/reminder backend
- universal multi-browser sync
- Tree/Circle behavior
- password change
- confirmed removal warning
- login/session/startup animation
- Vault, Help Board, Account, and every other flow/UI

No new Supabase SQL is required.
