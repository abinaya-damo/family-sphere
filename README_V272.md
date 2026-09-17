# Family Sphere v272 — persistent Tree zoom/pan + profile-drag fix

Built directly from v271.

Fixes only the Family Tree viewport/profile movement issue:
- Manual Tree zoom remains where the user leaves it.
- Manual Tree pan remains where the user leaves it.
- Dragging an individual member profile no longer makes the entire Tree return to Fit mode after release.
- Dragged profile positions remain visible/stored after release.
- Going to another module and returning to Tree restores the same Tree viewport.
- Adding/removing members still triggers a fresh optimized fit because the family size changed.
- Explicit Fit Tree remains the manual reset.
- Family Circle zoom/fit persistence from the previous build is preserved unchanged.

Everything else remains strictly unchanged:
notifications/reminders, live sync, login/session, startup animation, Vault,
Help Board, Events, Dashboard, and all other workflows.

No new Supabase SQL is required.
