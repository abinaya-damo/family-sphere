-- Family Sphere v226 — removed-member access + stale relationship fix
-- Safe to run on an existing v225 Supabase project.

begin;

-- Remove approved MEMBER accounts whose linked family-tree person no longer exists.
-- Owner memberships are intentionally preserved as a safety measure.
delete from public.family_memberships m
where m.role = 'member'
  and m.person_id is not null
  and not exists (
    select 1
    from public.family_people p
    where p.family_id = m.family_id
      and p.person_id = m.person_id
  );

-- Keep membership identity tied to the actual graph record going forward.
-- If a non-owner person's graph record is deleted, their membership is deleted too.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'family_memberships_person_fk'
  ) then
    alter table public.family_memberships
      add constraint family_memberships_person_fk
      foreign key (family_id, person_id)
      references public.family_people (family_id, person_id)
      on delete cascade;
  end if;
end $$;

commit;
