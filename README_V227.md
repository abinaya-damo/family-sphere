# Family Sphere v227 — Removed Member Hard Lock

This release fixes the remaining cross-browser relationship bug after an approved member is removed.

## Fixed behavior
- Removing a linked family member revokes that member membership on the server.
- Any open browser for that removed account receives HTTP 403 on its next sync/focus.
- The browser clears its Supabase session and cached private family state.
- The private tree is hidden immediately.
- The startup Login / Create family / Join family gate is shown again.
- Relationship calculation never falls back to Grandfather or another first tree member after revocation.
- A 403 during either pull **or push** triggers the same hard lock.

## Existing database
If `supabase/V226_MEMBER_REMOVAL_FIX.sql` was already run, no new SQL is required for v227.
If it was not run, run it once.

## Daily use
After dependencies are installed, normally only run:

```powershell
npm.cmd run dev
```

Use `npm.cmd ci` for a newly extracted project/dependency change and `npm.cmd run build` before deployment.
