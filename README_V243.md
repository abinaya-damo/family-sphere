Family Sphere v243 — Help Board Runtime Fix

Only Help Board interaction code was changed from v242.

Fixed:
- Added the missing ensureHelpBackend() runtime function. v242 called this function but never defined it, causing Help actions to fail only when clicked.
- Removed the layered document-level Help click delegation to prevent duplicate/conflicting handlers.
- Help card buttons now call one explicit action path directly:
  - I can help
  - Cancel help
  - Delete
- Request help remains bound directly to the Help modal and Supabase-backed submit handler.
- Existing Help Board UI/alignment is unchanged.
- Existing family_states Supabase persistence is unchanged.

Supabase:
- No new SQL is required if the existing Family Sphere database and earlier Help migrations are already present.
