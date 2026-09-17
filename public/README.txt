Family Sphere v222 — Shared Family Graph

UI baseline: existing Family Sphere UI retained.
Backend change: one canonical Supabase family graph with per-login relationship perspective.

Core behavior:
- One family is created once by the owner.
- Direct-bond names entered in Family Tree become real family_people records.
- Direct parent / spouse / sibling bonds are stored in family_relationships.
- Join Family loads named people from the shared Supabase graph.
- On approval, the joining login is linked to one person through family_memberships.person_id.
- Existing matching profiles are claimed instead of duplicated when possible.
- If a profile does not exist, approval creates it and connects it to the selected anchor person.
- Every login becomes You on that device.
- The same graph is interpreted from that logged-in person's point of view, so in-law and extended relationships change automatically without duplicating the tree.

Existing Supabase users: run supabase/migration_v222_shared_family_graph.sql once before testing v222.
