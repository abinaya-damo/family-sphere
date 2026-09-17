# Family Sphere v269 — true whole-tree fit fix

Built directly from v268.

Root cause fixed:
The previous automatic fit logic fitted only the member-circle bounds. The decorative
tree/canvas is larger than those member bounds, so after returning from another page
the auto-fit zoomed back in even though manually zooming out looked correct.

v269 now:
- fits the complete natural Family Tree canvas (tree artwork + trunk + connectors + profiles);
- keeps that conservative fit every time Tree opens;
- uses the same fit after render, resize and returning to the browser tab;
- synchronizes the original hidden v82 zoom state with the visible fitted transform;
- keeps + / − / Fit controls consistent with the new fitted baseline;
- prevents older v214 auto-fit code from restoring the old member-only zoom.

Strictly unchanged:
- tree data, member positions, connections and manual profile drag storage
- notifications/reminders
- universal multi-browser live sync
- startup animation/session behavior
- Document Vault, Help Board, Events, Dashboard and every other workflow/UI

No new Supabase SQL is required.
