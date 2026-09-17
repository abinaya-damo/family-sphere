# Family Sphere v268 — Family Tree fit-state lock

Built directly from v267.

Fixed only the Family Tree viewport behavior:
- Family Tree always returns fitted/compressed inside its page.
- Leaving Tree for Document Vault, Help Board, Events, Dashboard, etc. clears stale tree zoom/pan state.
- Returning to Tree recalculates fit after the page is visible and layout is complete.
- The Fit Tree button now resets both the visible transform and the older hidden zoom multiplier.
- Browser tab return and resize also keep the complete tree inside the frame.

Strictly unchanged:
- v259 notification/reminder backend
- v261 universal multi-browser live sync
- v267 startup intro/direct transition
- persistent login/page restore
- Family Tree data, member positions, connections, drag storage
- all Document Vault, Help Board, Events, Dashboard and other UI/workflows

No new Supabase SQL is required.
