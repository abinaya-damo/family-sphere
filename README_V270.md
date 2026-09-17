# Family Sphere v270 — persistent Tree/Circle viewport + automatic fit for any family size

Built directly from v269.

Changed only Family Tree / Family Circle viewport behavior.

Family Tree:
- First open (or changed member/layout data) automatically optimizes and fits the complete tree inside the Family Tree area.
- User zoom and pan are saved per Family ID.
- Going to Document Vault, Help Board, Events, Dashboard, etc. does NOT reset the user's zoom/pan.
- Returning to Family Tree restores exactly the saved view.
- If the family structure/layout changes, the saved view is invalidated and a fresh optimized fit is calculated.
- Fit resets to the optimized whole-tree view and becomes the new baseline.

Family Circle:
- Automatically fits all members regardless of family size.
- User zoom and rotary position are saved per Family ID.
- Switching pages/views does not reset the user's chosen Circle view.
- If members/layout change, Circle automatically recalculates a fresh fit.

Strictly unchanged:
- family data, member positions, relationships, connectors, profile drag storage
- notifications/reminders
- universal multi-browser live sync
- startup animation/session behavior
- Document Vault, Help Board, Events, Dashboard, and all other UI/workflows

No new Supabase SQL is required.
