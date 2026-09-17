# Family Sphere v257

Targeted fixes only on top of v256.

## Fixed
1. Persistent Supabase login:
   - After a successful login, the browser keeps the Supabase session.
   - Refreshing does not return to Login.
   - Reopening the website link auto-resumes the approved member and opens Family Tree.
   - Expired access tokens are refreshed using the saved refresh token.

2. Notification backend reliability:
   - Existing live multi-browser sync remains enabled.
   - Notification list is not blanked during a temporary backend/network refresh failure.
   - Includes a focused idempotent Supabase notification migration:
     `supabase/V257_NOTIFICATION_BACKEND_FIX.sql`

## Strictly unchanged
Document Vault/live sync, Help Board, Events UI/workflow, Family Tree data/workflow,
dashboard, animations, themes, navigation UI, and other backend features.

## One-time Supabase step
Run only `V257_NOTIFICATION_BACKEND_FIX.sql` in Supabase SQL Editor.
Do NOT rerun the complete database setup and do NOT reset existing data.
