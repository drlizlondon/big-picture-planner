-- Product analytics events (acquisition / activation / engagement / retention /
-- feedback / auth). Written by src/services/analytics.ts and the landing pages.
-- Run this in the Supabase SQL editor before relying on the data.
--
-- The app emits *typed* events; here they land as (event, props jsonb) rows with
-- a stable anonymous client_id, a per-load session_id, optional user_id, device
-- type and acquisition source. Retention (D1/D7/D30) is derived from client_id +
-- created_at at query time. Keep this table append-only and anon-insertable so
-- both the static landing pages and the signed-out planner can write to it.

create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  event       text not null,
  props       jsonb not null default '{}'::jsonb,
  client_id   text,
  session_id  text,
  user_id     uuid references auth.users(id),
  device_type text,
  source      text,
  created_at  timestamptz not null default now()
);

create index if not exists analytics_events_event_idx on public.analytics_events(event);
create index if not exists analytics_events_client_idx on public.analytics_events(client_id);
create index if not exists analytics_events_created_idx on public.analytics_events(created_at);

alter table public.analytics_events enable row level security;

-- Anonymous + authenticated visitors can record events but never read them back.
drop policy if exists "anon insert analytics" on public.analytics_events;
create policy "anon insert analytics"
  on public.analytics_events for insert
  to anon, authenticated
  with check (true);

-- Admins can read for analysis (reuses public.is_admin() from setup.sql).
drop policy if exists "admins read analytics" on public.analytics_events;
create policy "admins read analytics"
  on public.analytics_events for select
  using (public.is_admin());

-- Example funnel query:
--   select event, count(*) from public.analytics_events
--   group by event order by count(*) desc;
