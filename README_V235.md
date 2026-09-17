Family Sphere v235 — Guaranteed Inline Record Save Feedback

Only the missing document save-button feedback was changed.

Fix:
- The Add document button now always shows: Save record → Saving… → ✓ Record saved.
- The success state remains visible briefly before the modal closes.
- The behavior is implemented in both the Supabase save path and the local fallback save path.
- No success toast is used for document saves.
- No Supabase SQL change is required.
