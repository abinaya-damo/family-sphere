-- Family Sphere v259: dedicated notification backend repair.
-- Safe/idempotent. Does not delete existing family data.

create extension if not exists pgcrypto;

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

alter table public.notifications add column if not exists recipient_person_id text;
alter table public.notifications add column if not exists type text;
alter table public.notifications add column if not exists message text;
alter table public.notifications add column if not exists target_page text;
alter table public.notifications add column if not exists is_read boolean not null default false;
alter table public.notifications add column if not exists created_at timestamptz not null default now();

create index if not exists notifications_recipient_idx on public.notifications(recipient_user_id,is_read,created_at desc);
create index if not exists notifications_family_idx on public.notifications(family_id,created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_recipient_select on public.notifications;
create policy notifications_recipient_select on public.notifications for select using (recipient_user_id=auth.uid() or public.is_family_owner(family_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
