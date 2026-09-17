# Family Sphere v273 — confirmed removal warning only

Built directly from stable v272.

Fixed only the login/removal-warning behavior:
- A single 403/stale family id/transient browser sync error no longer logs out an approved member.
- Before showing "Your access to this family has been removed...", Family Sphere now performs an authenticated backend membership check.
- The red removal warning appears only when the backend confirms that the user's family membership no longer exists.
- If the member is still approved, the browser automatically repairs/reloads the correct current family membership and keeps the user logged in.
- A temporarily delayed family-tree profile no longer causes false access removal.
- Stale red warning text is cleared automatically after a valid membership/session is restored.
- Actual removal from the Family Tree still removes the backend membership, so that removed user is locked out and shown the red warning.

Strictly unchanged:
- v272 Family Tree zoom/pan/profile-drag behavior
- Family Circle behavior
- v259 notifications/reminders
- universal multi-browser live sync
- persistent login/session
- startup animation
- Vault, Help Board, Events, Dashboard and every other workflow/UI

No new Supabase SQL is required.
