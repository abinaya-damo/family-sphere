Family Sphere v234 — Inline Record Saved + Silent Normal Sync

Changes only:
- After Save record succeeds, the same purple Save button shows “✓ Record saved”.
- The success state stays visible briefly before the modal closes.
- Removed the bottom-right “Record saved” success toast for document saving.
- Normal background “Saving…” / “Saved” sync flashes are now hidden.
- Offline / sync error / conflict warnings are still shown because they require attention.
- No Supabase SQL changes required.
