# Family Sphere v267 — intro directly to app, no intermediate screen

Built directly from v266.

Fixed only the startup transition:
- Animated Family Sphere intro remains for a minimum of 1.5 seconds.
- For a saved login, it stays covering the page until Supabase session restore and the actual app section are ready.
- It then fades directly into the app/dashboard/current section.
- The startup Login overlay no longer flashes during saved-session restore.
- Removed an orphan HTML closing tag left by the older launch-cover layer.
- If there is no saved login, the same 1.5 second intro transitions directly to Login.

Protected/unchanged:
- v259 notification/reminder backend
- v261 universal multi-browser live sync
- persistent login/page restore
- all app UI/workflows

No new SQL required.
