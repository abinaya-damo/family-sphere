# Supabase setup

## Fresh project
Open Supabase -> SQL Editor -> New query.
Paste all of `COMPLETE_SUPABASE_SETUP.sql` and click Run.

Then configure `.env.local` in the Family Sphere project root:

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
GEMINI_API_KEY=YOUR_GEMINI_KEY
GEMINI_MODEL=gemini-2.5-flash

Never prefix SUPABASE_SERVICE_ROLE_KEY or GEMINI_API_KEY with NEXT_PUBLIC_.

The SQL creates the Family Sphere tables, RLS helper functions/policies, private storage buckets, and the canonical family graph tables.
