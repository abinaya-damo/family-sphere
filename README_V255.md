# Family Sphere v255

Only Document Vault cross-browser synchronization was changed from v254.

- Supabase `documents` table is now watched by the existing live family stream.
- Add/delete/category-delete document changes trigger the other logged-in family browsers without refresh.
- The client compares document records independently of `family_states.updated_at`.
- The authoritative document list still comes from the existing Supabase `documents` table + private storage bucket.
- Dashboard, uploaded reference icon animations, login/auth, Help Board, Events & Reminders, notifications, Family Tree and all other UI/workflows are unchanged.
- No new SQL migration is required.
