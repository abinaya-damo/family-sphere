Family Sphere v242 — Help Board Stable-State Fix

Only the Help Board backend/action path is changed. The UI and all other pages remain unchanged.

Fixes:
- I can help works with stable Help IDs.
- Cancel help works.
- Delete help request works.
- Request help opens and saves.
- Help Board uses the existing family_states Supabase row as its single source of truth, avoiding UUID/client_id mismatches.
- Existing v238-v241 Help data is imported once when available.
- Cross-browser Help Board state is refreshed by the existing polling/focus refresh.
- No new SQL migration is required if Family Sphere Supabase is already configured.
