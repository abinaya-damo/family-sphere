Family Sphere v231 — Document Vault Database & Count Fix

Fixed
- Folder counts are always calculated from the actual records currently inside each category.
- Removed the old hard-coded demo-count contribution that caused outer/inner count mismatches.
- Open documents is a real clickable button on every category card.
- Save record now uses a dedicated protected backend action when Supabase is configured.
- Successful saves show: Record saved.
- Document metadata is stored in public.documents.
- Document files are stored in the private family-documents Supabase Storage bucket.
- View uses a signed URL for PDF/image preview.
- Download uses a signed URL for secure download.
- Delete record removes database metadata and attempts Storage cleanup.
- Delete category removes all database document rows in that category and attempts Storage cleanup.
- Existing legacy document records are merged for backward compatibility.
- Supported uploads: PDF, Word, Excel, TXT, JPG/JPEG, PNG, WEBP and GIF up to 12 MB.

Existing Supabase project
1. Open Supabase > SQL Editor > New query.
2. Run supabase/V231_DOCUMENT_VAULT_DATABASE_FIX.sql once.
3. Restart the app with npm.cmd run dev.

Fresh Supabase project
- Run supabase/COMPLETE_SUPABASE_SETUP.sql. It already includes the v231 documents schema.

No other Family Sphere UI/tree behavior was intentionally changed.
