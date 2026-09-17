Family Sphere v239 — Help Board Exact Layout + Button Fix

Only the Help Board was changed from v238.

- Restored the original Help Board alignment from v237.
- Delete icon is again absolute at the top-right of each card.
- Category badge, title, description, poster row and volunteer card spacing remain in their original positions.
- I can help works through the Supabase-backed action.
- Cancel help works through the Supabase-backed action.
- Delete works through the Supabase-backed action.
- Request help remains functional and persists to Supabase.
- Removed the CSS rule that moved the delete button into the card flow.
- Replaced delegated Help Board click handling with direct handlers that survive rerenders.
- No new SQL migration is required if V238_HELP_BOARD_REALTIME_FIX.sql has already been run.
- All non-Help-Board pages and features are unchanged.
