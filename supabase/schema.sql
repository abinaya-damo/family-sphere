-- Family Sphere Supabase schema
-- Run this entire file once in Supabase -> SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text,
  owner_person_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  display_name text,
  person_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, user_id)
);

-- This snapshot keeps the current Family Sphere UI/data model intact while making it multi-device.
create table if not exists public.family_states (
  family_id uuid primary key references public.families(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  photos jsonb not null default '{}'::jsonb,
  removed_members jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  anchor_person_id text not null,
  anchor_name text,
  relation text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  person_id text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  unique (family_id, user_id)
);

-- Normalized production tables. The current UI is synchronized through family_states,
-- and these tables are ready for future server-side reporting/analytics without changing UI.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  recipient_person_id text,
  type text,
  title text not null,
  message text,
  target_page text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  title text not null,
  category text,
  access_level text,
  storage_path text,
  file_name text,
  file_type text,
  file_size bigint,
  client_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.help_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_by_person_id text,
  title text not null,
  description text,
  category text,
  status text not null default 'open',
  client_id text,
  created_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.help_volunteers (
  id uuid primary key default gen_random_uuid(),
  help_request_id uuid not null references public.help_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id text,
  status text not null default 'volunteered',
  display_name text,
  volunteered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (help_request_id, user_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  category text,
  event_date date not null,
  event_time time,
  location text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  remind_before_minutes integer,
  reminder_at timestamptz,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists family_memberships_user_idx on public.family_memberships(user_id);
create index if not exists join_requests_family_status_idx on public.join_requests(family_id, status);
create index if not exists notifications_recipient_idx on public.notifications(recipient_user_id, is_read, created_at desc);
create index if not exists documents_family_idx on public.documents(family_id, created_at desc);
create unique index if not exists documents_family_client_id_uidx on public.documents(family_id, client_id);
create index if not exists documents_family_category_idx on public.documents(family_id, category, created_at desc);
create index if not exists help_requests_family_idx on public.help_requests(family_id, created_at desc);
create unique index if not exists help_requests_family_client_id_uidx on public.help_requests(family_id, client_id) where client_id is not null;
create index if not exists help_volunteers_request_status_idx on public.help_volunteers(help_request_id, status, volunteered_at desc);
create index if not exists events_family_date_idx on public.events(family_id, event_date, event_time);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists touch_families_updated_at on public.families;
create trigger touch_families_updated_at before update on public.families for each row execute function public.touch_updated_at();
drop trigger if exists touch_memberships_updated_at on public.family_memberships;
create trigger touch_memberships_updated_at before update on public.family_memberships for each row execute function public.touch_updated_at();
drop trigger if exists touch_help_volunteers_updated_at on public.help_volunteers;
create trigger touch_help_volunteers_updated_at before update on public.help_volunteers for each row execute function public.touch_updated_at();

-- RLS helper: user must belong to the family.
create or replace function public.is_family_member(target_family uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.family_memberships m
    where m.family_id = target_family and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_family_owner(target_family uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.family_memberships m
    where m.family_id = target_family and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

alter table public.families enable row level security;
alter table public.family_memberships enable row level security;
alter table public.family_states enable row level security;
alter table public.join_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.documents enable row level security;
alter table public.help_requests enable row level security;
alter table public.help_volunteers enable row level security;
alter table public.events enable row level security;
alter table public.event_reminders enable row level security;

-- Recreate policies safely.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public' and tablename in ('families','family_memberships','family_states','join_requests','notifications','documents','help_requests','help_volunteers','events','event_reminders') loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy families_member_select on public.families for select using (public.is_family_member(id));
create policy memberships_family_select on public.family_memberships for select using (public.is_family_member(family_id));
create policy state_family_select on public.family_states for select using (public.is_family_member(family_id));
create policy state_family_update on public.family_states for update using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy joins_owner_select on public.join_requests for select using (public.is_family_owner(family_id) or user_id=auth.uid());
create policy notifications_recipient_select on public.notifications for select using (recipient_user_id=auth.uid() or public.is_family_owner(family_id));
create policy documents_family_select on public.documents for select using (public.is_family_member(family_id));
create policy help_family_select on public.help_requests for select using (public.is_family_member(family_id));
create policy volunteers_family_select on public.help_volunteers for select using (exists(select 1 from public.help_requests h where h.id=help_request_id and public.is_family_member(h.family_id)));
create policy events_family_select on public.events for select using (public.is_family_member(family_id));
create policy reminders_owner_select on public.event_reminders for select using (user_id=auth.uid());


-- Data API grants. Required when "Automatically expose new tables" was disabled
-- when the Supabase project was created. The backend uses the secret/service role.
grant usage on schema public to service_role;
grant all privileges on table
  public.families,
  public.family_memberships,
  public.family_states,
  public.join_requests,
  public.notifications,
  public.documents,
  public.help_requests,
  public.help_volunteers,
  public.events,
  public.event_reminders
to service_role;

-- Keep future server-owned public tables accessible to the backend service role.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- Private storage buckets. Files are accessed using short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('family-documents','family-documents',false),('profile-photos','profile-photos',false)
on conflict (id) do update set public=false;

-- v222 shared canonical family graph
-- The block below is also available separately as migration_v222_shared_family_graph.sql
-- for existing Family Sphere Supabase projects.
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
