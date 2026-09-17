# Family Sphere v224 production checklist

## Required environment variables
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)

## Optional AI
- `GEMINI_API_KEY` (server only)
- `GEMINI_MODEL=gemini-2.5-flash`

## Before launch
1. Run `supabase/schema.sql` for a fresh Supabase project.
2. Confirm Storage buckets `family-documents` and `profile-photos` are private.
3. Create `.env.local` from `.env.example`; never commit `.env.local`.
4. Run `npm ci`, `npm run lint`, and `npm run build`.
5. Test create family, login, join request, approval, refresh, logout, document upload/view/download, and two-device simultaneous edits.
6. Set production domain and HTTPS.
7. Enable Supabase backups/PITR appropriate to your plan.
8. Add external error monitoring (for example Sentry) before broad public use.

## AI safety model
The browser calls only `/api/family-sphere-ai`. The server verifies the logged-in Supabase user and family membership before loading family graph context. The AI provider never receives service-role credentials and has no database write access.

## Next recommended architecture milestone
Move Events, Help Board, Documents and Notifications from snapshot-first persistence to their normalized Supabase tables, one module at a time. Keep the snapshot only as a compatibility/cache layer until all modules are migrated.
