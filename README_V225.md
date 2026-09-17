# Family Sphere v225 — Clean Next.js + Supabase + AI Ready

This build removes the unused Cloudflare Worker / D1 / Drizzle / Vite starter files that caused `Fetcher`, `D1Database`, and `cloudflare:workers` type errors.

## Install
Use Node.js 22.13+.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run dev
```

If Windows PowerShell blocks npm.ps1, use `npm.cmd` as shown above.

## Supabase
For a fresh Supabase project, run:

`supabase/COMPLETE_SUPABASE_SETUP.sql`

For an existing Family Sphere database that already has the v222 graph migration, do not wipe your database. Back up first and only apply missing migrations.

Create `.env.local` from `.env.example` and fill in your own keys.

## Architecture
- Next.js frontend/server routes
- Supabase Auth + Postgres + Storage
- Optional Gemini server integration
- No Cloudflare D1 dependency
- No Drizzle dependency


## v226 removed-member fix
If upgrading an existing database, run `supabase/V226_MEMBER_REMOVAL_FIX.sql` once. It removes stale member access when that person no longer exists in the shared tree.
