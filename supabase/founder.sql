-- ============================================================
-- Big Picture Planner — Founder Access migration
-- Run this in the Supabase SQL Editor (after waitlist.sql + access.sql).
-- Safe to run more than once.
--
-- Moves the product from a "28-day free trial" to a controlled, paid
-- Founder Access beta:
--   * Adds the new waitlist questions.
--   * Removes the 28-day expiry so redeemed (invited/paid) members are not
--     locked out mid-beta. Access is controlled by WHO gets a code, not by a
--     countdown. Payment is fulfilled manually for now (you send a code after
--     the £40 payment).
--   * Adds admin cohort metrics.
-- ============================================================

-- ─── 1. Waitlist: extra questions ─────────────────────────────
alter table public.waitlist add column if not exists use_case        text;
alter table public.waitlist add column if not exists current_method  text;
alter table public.waitlist add column if not exists founder_interest text;  -- 'yes' | 'maybe' | 'not_yet'

-- ─── 2. Redeeming a code now grants long-lived Founder Access ──
-- (was: now() + 28 days). The internal status stays 'trial' in get_my_access,
-- but with a ~100-year window it never expires and no countdown banner shows.
create or replace function public.redeem_access_code(p_code text)
returns json
language plpgsql security definer
as $$
declare
  v_code    record;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return json_build_object('status', 'unauthenticated');
  end if;

  if exists (select 1 from public.user_access where user_id = v_user_id) then
    return json_build_object('status', 'already_has_access');
  end if;

  select * into v_code
  from public.access_codes
  where code = upper(trim(p_code))
    and is_active = true
    and redeemed_by is null;

  if not found then
    return json_build_object('status', 'invalid');
  end if;

  update public.access_codes
  set redeemed_by   = v_user_id,
      redeemed_at   = now(),
      trial_ends_at = now() + interval '100 years'
  where code = v_code.code;

  insert into public.user_access (user_id, access_code, trial_ends_at)
  values (v_user_id, v_code.code, now() + interval '100 years');

  return json_build_object('status', 'ok', 'trial_ends_at', (now() + interval '100 years')::text);
end;
$$;

-- ─── 3. Extend anyone already on a 28-day clock ───────────────
-- So existing redeemed members (not paid, not comped) are not locked out.
update public.user_access
set trial_ends_at = now() + interval '100 years'
where not is_paid
  and not is_comped
  and trial_ends_at < now() + interval '90 days';

-- ─── 4. Admin cohort metrics ──────────────────────────────────
-- Founder member count is a placeholder until payment status is integrated:
-- for now, treat redeemed codes as your fulfilled founders (you only send a
-- code after the £40 payment), or track paid members manually.
create or replace function public.admin_metrics()
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_feedback bigint := 0;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  -- feedback table may not exist yet; count defensively
  begin
    execute 'select count(*) from public.feedback' into v_feedback;
  exception when undefined_table then
    v_feedback := 0;
  end;

  return json_build_object(
    'waitlist',             (select count(*) from public.waitlist),
    'founder_interest_yes', (select count(*) from public.waitlist where founder_interest = 'yes'),
    'invited',              (select count(*) from public.access_codes),
    'redeemed',             (select count(*) from public.access_codes where redeemed_at is not null),
    'active_block_users',   (select count(distinct user_id) from public.planner_blocks),
    'feedback',             v_feedback
  );
end;
$$;

grant execute on function public.admin_metrics() to authenticated;

-- ─── 5. Refund window: 7 days -> 14 days ──────────────────────
-- Founding Access includes a 14-day no-questions refund. This updates the
-- admin helper you run after a £40 payment so the in-app refund banner and
-- the offer match.
create or replace function public.grant_paid_access(
  p_email             text,
  p_stripe_payment_id text default null
)
returns text
language plpgsql security definer
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = lower(trim(p_email));
  if v_user_id is null then
    return 'Error: no user found with email ' || p_email;
  end if;

  insert into public.user_access (
    user_id, trial_ends_at, is_paid, paid_at, refund_window_ends_at,
    stripe_payment_id, granted_by_admin
  )
  values (
    v_user_id,
    now() + interval '100 years',
    true,
    now(),
    now() + interval '14 days',
    p_stripe_payment_id,
    true
  )
  on conflict (user_id) do update set
    is_paid               = true,
    paid_at               = now(),
    refund_window_ends_at = now() + interval '14 days',
    stripe_payment_id     = p_stripe_payment_id,
    trial_ends_at         = now() + interval '100 years';

  return 'Paid access granted to ' || p_email || ' (refund window closes ' || (now() + interval '14 days')::date::text || ')';
end;
$$;
