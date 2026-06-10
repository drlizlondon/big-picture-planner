-- ============================================================
-- Big Picture Planner — Google Calendar tester tracking
-- Run this in the Supabase SQL Editor (after setup.sql). Idempotent.
--
-- While the Google OAuth app is unverified, only Google accounts on the
-- Cloud Console "Test users" list can connect Google Calendar. Google has
-- no API for that list, so adding people is manual. This migration tracks
-- WHO needs it and WHO has been added, so the invite console can show it.
-- ============================================================

-- 1. Waitlist: ask at signup whether they use Google Calendar
alter table public.waitlist add column if not exists uses_gcal text;  -- 'yes' | 'no'

-- 2. Track when you added their Google account to the test-user list
alter table public.waitlist add column if not exists gcal_tester_at timestamptz;

-- 3. admin_waitlist now also returns the Google Calendar fields
create or replace function public.admin_waitlist()
returns table (
  "position" integer, email text, name text, signed_up_at timestamptz,
  code text, code_sent_at timestamptz, redeemed_at timestamptz, status text,
  uses_gcal text, gcal_tester_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return query
  select w.position, w.email, w.name, w.signed_up_at, c.code, c.sent_at, c.redeemed_at,
    case when c.redeemed_at is not null then 'redeemed'
         when c.code is not null then 'invited'
         else 'pending' end as status,
    w.uses_gcal, w.gcal_tester_at
  from public.waitlist w
  left join public.access_codes c on lower(c.email) = lower(w.email)
  order by w.position nulls last, w.signed_up_at;
end;
$$;

-- 4. Mark someone as added to the Google test-user list
create or replace function public.admin_mark_gcal(p_email text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_at timestamptz;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.waitlist set gcal_tester_at = coalesce(gcal_tester_at, now())
   where lower(email) = lower(trim(p_email)) returning gcal_tester_at into v_at;
  return v_at;
end;
$$;

grant execute on function public.admin_mark_gcal(text) to authenticated;
