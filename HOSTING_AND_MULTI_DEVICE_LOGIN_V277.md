# Family Sphere v277 — hosted shared login & join setup

**Important:** This is a Next.js application with an authenticated server API. Publishing `public/FAMILY_SPHERE.html` alone (or a static export/static website hosting) cannot support cross-device login, Join family, shared data, or Supabase server access. Deploy the entire extracted project to a hosting provider that runs Next.js API routes. Use one Supabase project for every device. There are no common/shared default login credentials.

## Required server-side environment variables

Set these in your hosting provider's **server environment variable settings** (Production and Preview as appropriate), then redeploy:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_SECRET
GEMINI_API_KEY=YOUR_GEMINI_KEY_IF_AI_IS_USED
GEMINI_MODEL=gemini-2.5-flash
```

Find Supabase keys and project URL in **Supabase Dashboard > Project Settings > API Keys** (the dashboard label may vary). Use the exact URL and matching keys from the SAME Supabase project. **Never paste service role or Gemini keys into HTML, browser JavaScript, GitHub, or chat.** These server variables are used only by Next.js API handlers. Do not prefix secret variable names with `NEXT_PUBLIC_`. The supplied `.env.example` is a template, not a working credential file.

## Shared database

For an existing working Family Sphere Supabase project, keep the same database, tables, and Storage; do not reset it or rerun old schema scripts unnecessarily. For a completely NEW Supabase project, follow `supabase/SETUP.md` and its referenced schema/migrations, then configure its private family-documents bucket and permissions. The SQL files are deployment setup for a fresh database; **no new v277 SQL migration is required** for an already working database.

## Verify hosting BEFORE inviting users

1. Open `https://YOUR_LIVE_DOMAIN/api/family-sphere` in a browser: API routes must exist on this host. If the host returns its static-site 404 page, the project has been deployed as a static website and joining cannot work. The API itself only accepts supported HTTP methods; a 405 response on GET may be expected.
2. In browser DevTools > Network, try logging in with a REAL approved email/password; `POST /api/family-sphere` with `action:health` should return JSON with `configured:true`. If false/503, set all three Supabase server variables on the hosting provider, redeploy, and check server logs.
3. If local and hosted Family Sphere show different family lists/IDs, compare `SUPABASE_URL` on both deployments. Copy the SAME server variables to both; never create another family as a "fix" for an existing shared family.
4. Owner creates a real family using their own name/email/password (or signs in with the existing approved account); copy the family ID shown in Family Tree. A local-only demo Family ID has no backend family record and cannot be joined from another device.
5. On a different laptop: open the exact same live domain, choose Join family, enter the shared Family ID, use that person's OWN real email and a NEW password, choose a named existing family member and relationship, and send request. Owner approves Join Requests; the member can then log in using their email/password.
6. If account already exists in Supabase, use its existing password in Join family; a different password for an existing email cannot create a second account. Pending join requests cannot open the private site before approval.
7. Test two browsers with the same approved member and another approved member. Confirm that account/session, events and documents sync using the same family ID.

**Security:** We cannot provide anyone's actual email, passwords, service-role key or project secrets; they belong to each person and your own Supabase project. There is no safe universal username/password for all family members.
