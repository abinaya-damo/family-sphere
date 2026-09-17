-- Family Sphere v231
-- Document Vault database migration
-- Safe to run on an existing Family Sphere Supabase project.

begin;

alter table if exists public.documents
  add column if not exists client_id text;

create unique index if not exists documents_family_client_id_uidx
  on public.documents(family_id, client_id);

create index if not exists documents_family_category_idx
  on public.documents(family_id, category, created_at desc);

-- Backfill older document metadata that already has a Supabase Storage path in
-- family_states.state.docs. Records that only existed as browser-local fileData
-- cannot be safely migrated by SQL and remain supported by the compatibility layer.
insert into public.documents (
  family_id, uploaded_by, title, category, access_level, storage_path,
  file_name, file_type, file_size, client_id, created_at
)
select
  fs.family_id,
  fm.user_id,
  coalesce(nullif(d->>'name',''), 'Document'),
  nullif(d->>'cat',''),
  nullif(d->>'access',''),
  nullif(d->>'storagePath',''),
  nullif(d->>'fileName',''),
  nullif(d->>'fileType',''),
  case when coalesce(d->>'fileSize','') ~ '^[0-9]+$' then (d->>'fileSize')::bigint else null end,
  nullif(d->>'id',''),
  coalesce(nullif(d->>'uploadedAt','')::timestamptz, fs.updated_at, now())
from public.family_states fs
cross join lateral jsonb_array_elements(coalesce(fs.state->'docs','[]'::jsonb)) d
left join public.family_memberships fm
  on fm.family_id = fs.family_id
 and fm.person_id = nullif(d->>'postedById','')
where nullif(d->>'storagePath','') is not null
  and nullif(d->>'id','') is not null
on conflict (family_id, client_id) do update set
  title = excluded.title,
  category = excluded.category,
  access_level = excluded.access_level,
  storage_path = excluded.storage_path,
  file_name = excluded.file_name,
  file_type = excluded.file_type,
  file_size = excluded.file_size;

-- Existing table is already protected by RLS in the main Family Sphere schema.
-- The Next.js API verifies family membership before using the service role.

commit;
