Family Sphere v237 — Page Navigation Isolation Fix

This update keeps the working Document Vault from v236 unchanged and restores normal navigation behavior for the rest of the application.

Fixes:
- Dashboard opens its original Dashboard UI only.
- Help Board opens its original Help Board UI only.
- Events & Reminders opens its original Events UI only.
- Document Vault category, add-record, and preview overlays are automatically closed when navigating away from Document Vault.
- Help and Events page-specific dialogs are also isolated to their own pages.
- Exactly one main page is active after every sidebar/dashboard navigation action.
- Existing Document Vault save/count/view/download/delete behavior is retained.
- No Supabase SQL change is required.
