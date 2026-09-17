Family Sphere v232 — Live Vault Count + Persistent Login

Fixes:
- Corrected a v231 JavaScript syntax error that prevented the Supabase backend bridge from loading.
- Document category counts now update immediately after Save/Delete without page refresh.
- Entering the Vault also recalculates counts from the current real document list.
- Browser refresh keeps an authenticated Supabase session signed in.
- Browser refresh restores the last Family Sphere section (Dashboard, Tree, Chat, Vault, Help, Events or Account).
- Expired access tokens use the saved Supabase refresh token automatically.
- Login is shown again only after explicit logout/close-family, invalid/expired refresh credentials, or revoked family access.
- No database schema change is required from v231.
