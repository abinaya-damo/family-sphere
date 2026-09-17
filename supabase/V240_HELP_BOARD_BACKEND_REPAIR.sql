-- Family Sphere v240 - Help Board backend repair
-- Safe/idempotent for an existing Family Sphere Supabase database.
-- Run once in Supabase -> SQL Editor.

alter table if exists public.help_requests
  add column if not exists client_id text,
  add column if not exists created_by_name text,
  add column if not exists created_by_person_id uuid,
  add column if not exists status text default 'open';

alter table if exists public.help_volunteers
  add column if not exists person_id uuid,
  add column if not exists display_name text,
  add column if not exists status text default 'volunteered',
  add column if not exists volunteered_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Every request needs a stable browser/client id so buttons target the same row
-- in every browser.
update public.help_requests
set client_id = 'help-db-' || id::text
where client_id is null or btrim(client_id) = '';

create unique index if not exists help_requests_family_client_id_uidx
  on public.help_requests(family_id, client_id)
  where client_id is not null;

create index if not exists help_requests_family_status_idx
  on public.help_requests(family_id, status, created_at);

create index if not exists help_volunteers_request_status_idx
  on public.help_volunteers(help_request_id, status, volunteered_at desc);

create index if not exists help_volunteers_user_idx
  on public.help_volunteers(user_id, help_request_id);

-- The Next.js API uses the service role; keep its access explicit.
grant all privileges on table public.help_requests, public.help_volunteers to service_role;
