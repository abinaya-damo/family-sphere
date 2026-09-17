Family Sphere v241 — Help Board Request ID Fix

Changes only Help Board request resolution and button reliability.

- Help actions now send both Supabase request UUID and client ID.
- Backend resolves by UUID first, then client ID.
- Fixes Help request not found for Volunteer, Cancel and Delete on existing rows.
- Request help button is explicitly bound to open the Help modal.
- Existing Help Board layout and all other Family Sphere pages remain unchanged.
- No new SQL migration is required if V238/V240 Help Board SQL was already run.
