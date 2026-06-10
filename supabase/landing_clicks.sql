-- Landing page CTA click tracking.
-- Run this in the Supabase SQL editor before launch so bppTrack() inserts succeed.
-- Events recorded: hero_try_demo, hero_request_founding_access, nav_try_demo,
-- demo_open_demo, demo_request_founding_access, pricing_request_founding_access,
-- pricing_try_demo_first, bottom_request_founding_access, bottom_open_demo,
-- founder_request_submitted_<source> (form submissions, by originating CTA).

create table if not exists public.landing_clicks (
  id bigint generated always as identity primary key,
  event text not null,
  page text,
  created_at timestamptz not null default now()
);

alter table public.landing_clicks enable row level security;

-- Anonymous visitors can record clicks but never read them back.
drop policy if exists "anon insert clicks" on public.landing_clicks;
create policy "anon insert clicks"
  on public.landing_clicks for insert
  to anon
  with check (true);

-- Quick summary for the admin dashboard / SQL editor:
--   select event, count(*) from public.landing_clicks
--   group by event order by count(*) desc;
