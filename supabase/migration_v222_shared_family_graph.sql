-- Family Sphere v222: shared canonical family graph migration
-- Run ONCE in Supabase -> SQL Editor for an existing v215-v221 project.
-- This keeps existing family_states data and normalizes people + direct bonds
-- so every approved account can view the same family from its own "You" perspective.

create table if not exists public.family_people (
  family_id uuid not null references public.families(id) on delete cascade,
  person_id text not null,
  name text not null,
  gender text,
  dob text,
  phone text,
  alternate_phone text,
  email text,
  address text,
  default_role text,
  editable_name text,
  is_placeholder boolean not null default false,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (family_id, person_id)
);

create table if not exists public.family_relationships (
  family_id uuid not null references public.families(id) on delete cascade,
  relationship_id text not null,
  from_person_id text not null,
  to_person_id text not null,
  relationship_type text not null check (relationship_type in ('parent','spouse','sibling')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (family_id, relationship_id)
);

create index if not exists family_people_name_idx
  on public.family_people(family_id, lower(name));
create index if not exists family_people_claimed_idx
  on public.family_people(family_id, claimed_by_user_id);
create index if not exists family_relationships_family_idx
  on public.family_relationships(family_id, relationship_type);
create index if not exists family_relationships_from_idx
  on public.family_relationships(family_id, from_person_id);
create index if not exists family_relationships_to_idx
  on public.family_relationships(family_id, to_person_id);

-- Existing installations already have person_id, but keep migration idempotent.
alter table public.family_memberships add column if not exists person_id text;

-- Backfill canonical people from the existing shared family snapshot.
insert into public.family_people (
  family_id, person_id, name, gender, dob, phone, alternate_phone, email, address,
  default_role, editable_name, is_placeholder, profile, created_at, updated_at
)
select
  fs.family_id,
  p->>'id' as person_id,
  coalesce(nullif(p->>'editableName',''), nullif(p->>'name',''), nullif(p->>'defaultRole',''), 'Family member') as name,
  nullif(p->>'gender','') as gender,
  nullif(p->>'dob','') as dob,
  nullif(coalesce(p->>'phone',p->>'mobile'),'') as phone,
  nullif(p->>'alternatePhone','') as alternate_phone,
  nullif(p->>'email','') as email,
  nullif(p->>'address','') as address,
  nullif(p->>'defaultRole','') as default_role,
  nullif(p->>'editableName','') as editable_name,
  case
    when coalesce(p->>'defaultRole','') <> ''
      and coalesce(p->>'defaultRole','') <> 'You'
      and coalesce(p->>'editableName','') = '' then true
    else false
  end as is_placeholder,
  p as profile,
  coalesce(nullif(p->>'createdAt','')::bigint, 0) * interval '1 millisecond' + timestamptz '1970-01-01' as created_at,
  now() as updated_at
from public.family_states fs
cross join lateral jsonb_array_elements(coalesce(fs.state->'people','[]'::jsonb)) p
where coalesce(p->>'id','') <> ''
on conflict (family_id, person_id) do update set
  name=excluded.name,
  gender=excluded.gender,
  dob=excluded.dob,
  phone=excluded.phone,
  alternate_phone=excluded.alternate_phone,
  email=excluded.email,
  address=excluded.address,
  default_role=excluded.default_role,
  editable_name=excluded.editable_name,
  is_placeholder=excluded.is_placeholder,
  profile=excluded.profile,
  updated_at=now();

-- Backfill direct graph edges from the existing shared snapshot.
insert into public.family_relationships (
  family_id, relationship_id, from_person_id, to_person_id, relationship_type, metadata, updated_at
)
select
  fs.family_id,
  coalesce(nullif(c->>'id',''), 'bond_' || md5(fs.family_id::text || coalesce(c->>'fromPersonId','') || coalesce(c->>'toPersonId','') || coalesce(c->>'type',''))) as relationship_id,
  c->>'fromPersonId',
  c->>'toPersonId',
  c->>'type',
  c,
  now()
from public.family_states fs
cross join lateral jsonb_array_elements(coalesce(fs.state->'connections','[]'::jsonb)) c
where coalesce(c->>'fromPersonId','') <> ''
  and coalesce(c->>'toPersonId','') <> ''
  and c->>'type' in ('parent','spouse','sibling')
on conflict (family_id, relationship_id) do update set
  from_person_id=excluded.from_person_id,
  to_person_id=excluded.to_person_id,
  relationship_type=excluded.relationship_type,
  metadata=excluded.metadata,
  updated_at=now();

-- Mark profiles already linked to real login accounts.
update public.family_people p
set claimed_by_user_id = m.user_id,
    updated_at = now()
from public.family_memberships m
where m.family_id=p.family_id
  and m.person_id=p.person_id
  and m.person_id is not null;

alter table public.family_people enable row level security;
alter table public.family_relationships enable row level security;

drop policy if exists family_people_member_select on public.family_people;
create policy family_people_member_select on public.family_people
for select using (public.is_family_member(family_id));

drop policy if exists family_relationships_member_select on public.family_relationships;
create policy family_relationships_member_select on public.family_relationships
for select using (public.is_family_member(family_id));

grant all privileges on table public.family_people, public.family_relationships to service_role;

-- Keep future backend-owned tables accessible when automatic Data API exposure is disabled.
alter default privileges in schema public grant all on tables to service_role;

-- Helpful verification after Run:
-- select family_id, person_id, name, default_role, is_placeholder, claimed_by_user_id from public.family_people order by name;
-- select family_id, from_person_id, to_person_id, relationship_type from public.family_relationships order by relationship_type;
