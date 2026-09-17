-- Family Sphere v238 Help Board persistence + cross-browser sync
-- Run ONCE in Supabase -> SQL Editor for an existing Family Sphere project.

alter table public.help_requests
  add column if not exists client_id text,
  add column if not exists created_by_name text;

alter table public.help_volunteers
  add column if not exists display_name text;

create unique index if not exists help_requests_family_client_id_uidx
  on public.help_requests(family_id, client_id)
  where client_id is not null;

create index if not exists help_volunteers_request_status_idx
  on public.help_volunteers(help_request_id, status, volunteered_at desc);

-- Backfill client ids for older rows so every Help Board request can be addressed safely.
update public.help_requests
set client_id = 'help-db-' || id::text
where client_id is null or btrim(client_id) = '';

-- Keep service-role backend access explicit.
grant all privileges on table public.help_requests, public.help_volunteers to service_role;
