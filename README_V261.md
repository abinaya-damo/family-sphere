# Family Sphere v261 — real universal live-sync + refresh stability fix

Built directly from the working v259 notification/reminder baseline.

## Fixed
- Same-tab refresh stays on the exact current section.
- Startup scripts cannot overwrite the restore target with Family Tree during session restore.
- A fresh new tab/open still starts at Family Tree.
- Remote rendering is sync-silent. `renderGraphTree()` calls `save()`, and that was
  falsely marking receiving browsers dirty after each remote update; this was the
  reason later live updates could stop until refresh.
- Complete shared state is watched every 250 ms for local edits missed by legacy handlers.
- Shared family state pulls every 700 ms as a fallback to the existing SSE live stream.
- Document Vault authoritative records refresh every 800 ms.
- Leaving an edited field immediately checks for a local mutation and pulls the newest remote state.

## Protected/unchanged
The working v259 notification backend, reminder timing/delivery, read/unread state,
notification counts, UI, themes, layouts, and unrelated functions are unchanged.

## Supabase
No new SQL is required. Keep the v259 notification SQL already applied.
