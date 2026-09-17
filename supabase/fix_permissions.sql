-- Family Sphere v216: one-time fix for
-- "permission denied for table family_memberships"
-- Run this in Supabase -> SQL Editor -> New query -> Run.

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

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- v222 shared graph tables
grant all privileges on table public.family_people, public.family_relationships to service_role;
