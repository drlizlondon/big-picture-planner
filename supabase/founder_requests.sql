-- Founder request fields for the controlled paid-beta funnel.
-- Run this in the Supabase SQL editor BEFORE deploying the updated landing page,
-- otherwise the request form inserts will fail on the unknown columns.
--
-- The landing page "Request Founding Access" form writes to the existing
-- public.waitlist table (insert policy already allows anon). These columns
-- capture intent and attribution:

alter table public.waitlist add column if not exists cta_source   text;     -- hero | demo | pricing | bottom | direct
alter table public.waitlist add column if not exists price_ack    boolean;  -- ticked "I understand this is a £40 paid beta"
alter table public.waitlist add column if not exists utm_source   text;
alter table public.waitlist add column if not exists utm_medium   text;
alter table public.waitlist add column if not exists utm_campaign text;

-- Lightweight status pipeline for reviewing requests and inviting batches.
-- Suggested values: new | strong_intent | invited | paid | code_issued |
-- activated | refunded | not_selected
alter table public.waitlist add column if not exists status text not null default 'new';

-- Quick review queries:
--   select email, name, cta_source, price_ack, current_method, status, signed_up_at
--   from public.waitlist order by signed_up_at desc;
--
--   select cta_source, count(*) filter (where price_ack) as acknowledged, count(*) as total
--   from public.waitlist group by cta_source;
