# Family Sphere v222 — Supabase shared family graph

The existing Family Sphere UI is preserved. v222 changes the backend relationship model so one family has one canonical person graph and each approved account gets its own `You` perspective.

## Existing Supabase project (v215-v221)

Run this file once in **Supabase -> SQL Editor**:

`supabase/migration_v222_shared_family_graph.sql`

It creates:

- `family_people` — every person in the family, including profiles created before they have a login.
- `family_relationships` — canonical direct `parent`, `spouse`, and `sibling` bonds.
- indexes, RLS policies and service-role grants.
- a migration of the current `family_states.people` and `family_states.connections` data into the new tables.

Do not create a new Supabase project and do not delete the existing family.

## Fresh Supabase project

Run `supabase/schema.sql` completely. It includes the v222 graph schema.

## Environment

Keep `.env.local` in the project root:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET_KEY
```

Never expose the secret/service-role key in browser code.

## v222 family flow

1. Owner creates one family.
2. Owner enters real names into the Family Tree direct-bond profiles.
3. Those people and their direct bonds are synchronized into Supabase.
4. A relative opens the same website and chooses **Join Family**.
5. Family ID loads named people from `family_people`.
6. Relative selects the exact person they are connected to and the direct bond (Parent / Spouse / Child / Sibling).
7. Owner approves the request.
8. Backend links the login account to an existing matching person when possible, otherwise creates a new person and direct relationship.
9. On login, `family_memberships.person_id` becomes that account's `You` node.
10. Family Tree / Circle relationship labels are recalculated from that person's viewpoint.

Example:

- Abi sees Ananya as `Sister` and Arjun as `Brother-in-law`.
- Arjun sees himself as `You`, Ananya as `Wife`, Abi as `Sister-in-law`, and Ananya's parents as `Father-in-law` / `Mother-in-law`.

The underlying family graph is the same for both accounts.
