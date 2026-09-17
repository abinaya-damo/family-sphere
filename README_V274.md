# Family Sphere v274 — password change works from every signed-in browser

Built directly from v273.

Root cause:
The Account & Security "Change password" button was still using the old browser-local
familyRegistry to identify the account. Browser 1 happened to contain that local account
record, while Browser 2 was correctly signed in through Supabase but did not have the same
local registry entry, so it showed "No signed-in account found".

v274 fixes only that:
- Change Password now uses the real Supabase authenticated session.
- It works from any browser where that member is signed in.
- Before changing password, the backend confirms that the user is still an approved family member.
- The password update applies to that authenticated Supabase account.
- The old local registry is updated only as a compatibility cache; it is no longer the authority.
- Existing login/removal protection from v273 remains unchanged.

Strictly unchanged:
- v272 Tree zoom/pan/profile-drag behavior
- Family Circle
- notifications/reminders
- universal multi-browser live sync
- startup animation/session restore
- Vault, Help Board, Events, Dashboard and all other workflows/UI

No new Supabase SQL is required.
