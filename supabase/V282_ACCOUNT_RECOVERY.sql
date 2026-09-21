-- Family Sphere v282: apply once to the SAME Supabase project in SQL Editor.
-- Create a dedicated, service-role-only recovery registry. Never expose its hashes to the client.
create table if not exists public.account_recovery_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login_email text not null unique,
  code_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists account_recovery_codes_email_idx on public.account_recovery_codes(login_email);
alter table public.account_recovery_codes enable row level security;
revoke all on public.account_recovery_codes from anon, authenticated;
-- No client policies. Only the server-side Supabase service role may manage recovery records.
