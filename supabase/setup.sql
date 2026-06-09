-- ============================================================
-- Big Picture Planner — COMPLETE SETUP (idempotent)
-- Paste this whole file into the Supabase SQL Editor and run it.
-- Safe to run more than once. Creates anything missing and applies the
-- Founder Access model (no trial, £40 one-off, 14-day refund).
--
-- NOTE: the planner app's own sync table (public.planner_blocks) is created
-- by the app on first sync; admin_metrics counts it defensively if absent.
-- ============================================================

-- ─── 0. Admin allow-list ──────────────────────────────────────
-- Add more emails here if you bring on a teammate.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(lower(auth.jwt() ->> 'email') in ('lizziesoyode@gmail.com'), false);
$$;

-- ─── 1. Waitlist ──────────────────────────────────────────────
create table if not exists public.waitlist (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  name         text,
  signed_up_at timestamptz not null default now(),
  position     integer,
  source       text default 'landing'
);

-- Founder questions
alter table public.waitlist add column if not exists use_case         text;
alter table public.waitlist add column if not exists current_method   text;
alter table public.waitlist add column if not exists founder_interest text;  -- 'yes' | 'maybe' | 'not_yet'

create or replace function public.set_waitlist_position()
returns trigger language plpgsql security definer as $$
begin
  new.position := (select coalesce(max(position), 0) + 1 from public.waitlist);
  return new;
end;
$$;

drop trigger if exists waitlist_position_trigger on public.waitlist;
create trigger waitlist_position_trigger
  before insert on public.waitlist
  for each row execute function public.set_waitlist_position();

alter table public.waitlist enable row level security;
drop policy if exists "Anyone can join waitlist" on public.waitlist;
create policy "Anyone can join waitlist" on public.waitlist for insert with check (true);
drop policy if exists "Authenticated users can read waitlist" on public.waitlist;
drop policy if exists "Admins can read waitlist" on public.waitlist;
create policy "Admins can read waitlist" on public.waitlist for select using (public.is_admin());

-- ─── 2. Feedback ──────────────────────────────────────────────
create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  rating       int,
  use_cases    text[],
  missing      text,
  working      text,
  email        text,
  name         text,
  source       text default 'direct',
  submitted_at timestamptz default now()
);

alter table public.feedback enable row level security;
drop policy if exists "Anyone can submit feedback" on public.feedback;
create policy "Anyone can submit feedback" on public.feedback for insert with check (true);
drop policy if exists "Admins can read feedback" on public.feedback;
create policy "Admins can read feedback" on public.feedback for select using (public.is_admin());

-- ─── 3. Access codes + user access ────────────────────────────
create table if not exists public.access_codes (
  code              text primary key default upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  email             text not null,
  waitlist_position integer,
  created_at        timestamptz not null default now(),
  sent_at           timestamptz,
  redeemed_at       timestamptz,
  redeemed_by       uuid references auth.users(id),
  trial_ends_at     timestamptz,
  is_active         boolean not null default true
);
create index if not exists access_codes_email_idx on public.access_codes(email);

alter table public.access_codes enable row level security;
drop policy if exists "Anyone can read an active code" on public.access_codes;
create policy "Anyone can read an active code" on public.access_codes for select using (is_active = true);
drop policy if exists "Users can redeem their own code" on public.access_codes;
create policy "Users can redeem their own code" on public.access_codes for update
  using (auth.uid() = redeemed_by or redeemed_by is null)
  with check (auth.uid() = redeemed_by);

create table if not exists public.user_access (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  access_code           text references public.access_codes(code),
  trial_starts_at       timestamptz not null default now(),
  trial_ends_at         timestamptz not null,
  is_paid               boolean not null default false,
  paid_at               timestamptz,
  refund_window_ends_at timestamptz,
  stripe_payment_id     text,
  is_comped             boolean not null default false,
  comp_note             text,
  granted_by_admin      boolean not null default false,
  created_at            timestamptz not null default now()
);

alter table public.user_access enable row level security;
drop policy if exists "Users can read their own access" on public.user_access;
create policy "Users can read their own access" on public.user_access for select using (auth.uid() = user_id);
drop policy if exists "Users can insert their own access" on public.user_access;
create policy "Users can insert their own access" on public.user_access for insert with check (auth.uid() = user_id);

-- ─── 4. Redeem a code -> long-lived Founder Access (no expiry) ─
create or replace function public.redeem_access_code(p_code text)
returns json language plpgsql security definer as $$
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
  select * into v_code from public.access_codes
   where code = upper(trim(p_code)) and is_active = true and redeemed_by is null;
  if not found then
    return json_build_object('status', 'invalid');
  end if;
  update public.access_codes
     set redeemed_by = v_user_id, redeemed_at = now(), trial_ends_at = now() + interval '100 years'
   where code = v_code.code;
  insert into public.user_access (user_id, access_code, trial_ends_at)
   values (v_user_id, v_code.code, now() + interval '100 years');
  return json_build_object('status', 'ok', 'trial_ends_at', (now() + interval '100 years')::text);
end;
$$;

-- ─── 5. Current access status (read on every login) ───────────
create or replace function public.get_my_access()
returns json language plpgsql security definer as $$
declare
  v_access  record;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return json_build_object('status', 'unauthenticated');
  end if;
  select * into v_access from public.user_access where user_id = v_user_id;
  if not found then
    return json_build_object('status', 'no_access');
  end if;
  if v_access.is_paid then
    return json_build_object('status', 'paid',
      'in_refund_window', (v_access.refund_window_ends_at is not null and v_access.refund_window_ends_at > now()),
      'refund_window_ends_at', v_access.refund_window_ends_at::text);
  end if;
  if v_access.is_comped then
    if v_access.trial_ends_at > now() then
      return json_build_object('status', 'comped', 'trial_ends_at', v_access.trial_ends_at::text,
        'days_remaining', greatest(0, extract(day from v_access.trial_ends_at - now()))::int);
    else
      return json_build_object('status', 'expired');
    end if;
  end if;
  if v_access.trial_ends_at > now() then
    return json_build_object('status', 'trial', 'trial_ends_at', v_access.trial_ends_at::text,
      'days_remaining', greatest(0, extract(day from v_access.trial_ends_at - now()))::int);
  end if;
  return json_build_object('status', 'expired', 'trial_ends_at', v_access.trial_ends_at::text);
end;
$$;

-- ─── 6. Admin: grant comp access (press / friends / testers) ──
create or replace function public.grant_comp_access(p_email text, p_days integer default 365, p_note text default null)
returns text language plpgsql security definer as $$
declare v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = lower(trim(p_email));
  if v_user_id is null then return 'Error: no user found with email ' || p_email; end if;
  insert into public.user_access (user_id, trial_ends_at, is_comped, comp_note, granted_by_admin)
  values (v_user_id, now() + (p_days || ' days')::interval, true, p_note, true)
  on conflict (user_id) do update set
    is_comped = true, trial_ends_at = now() + (p_days || ' days')::interval, comp_note = p_note;
  return 'Comp access granted to ' || p_email || ' for ' || p_days || ' days';
end;
$$;

-- ─── 7. Admin: grant paid access (run after a £40 payment) ────
-- Founding Access includes a 14-day no-questions refund.
create or replace function public.grant_paid_access(p_email text, p_stripe_payment_id text default null)
returns text language plpgsql security definer as $$
declare v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = lower(trim(p_email));
  if v_user_id is null then return 'Error: no user found with email ' || p_email; end if;
  insert into public.user_access (user_id, trial_ends_at, is_paid, paid_at, refund_window_ends_at, stripe_payment_id, granted_by_admin)
  values (v_user_id, now() + interval '100 years', true, now(), now() + interval '14 days', p_stripe_payment_id, true)
  on conflict (user_id) do update set
    is_paid = true, paid_at = now(), refund_window_ends_at = now() + interval '14 days',
    stripe_payment_id = p_stripe_payment_id, trial_ends_at = now() + interval '100 years';
  return 'Paid access granted to ' || p_email || ' (refund window closes ' || (now() + interval '14 days')::date::text || ')';
end;
$$;

-- ─── 8. Admin invite console functions ────────────────────────
create or replace function public.admin_waitlist()
returns table (
  "position" integer, email text, name text, signed_up_at timestamptz,
  code text, code_sent_at timestamptz, redeemed_at timestamptz, status text
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return query
  select w.position, w.email, w.name, w.signed_up_at, c.code, c.sent_at, c.redeemed_at,
    case when c.redeemed_at is not null then 'redeemed'
         when c.code is not null then 'invited'
         else 'pending' end as status
  from public.waitlist w
  left join public.access_codes c on lower(c.email) = lower(w.email)
  order by w.position nulls last, w.signed_up_at;
end;
$$;

create or replace function public.admin_generate_code(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text; v_pos integer;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  p_email := lower(trim(p_email));
  if p_email is null or p_email = '' then raise exception 'email required'; end if;
  select code into v_code from public.access_codes where lower(email) = p_email limit 1;
  if v_code is not null then return v_code; end if;
  select position into v_pos from public.waitlist where lower(email) = p_email limit 1;
  insert into public.access_codes (email, waitlist_position) values (p_email, v_pos) returning code into v_code;
  return v_code;
end;
$$;

create or replace function public.admin_mark_sent(p_email text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_sent timestamptz;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.access_codes set sent_at = coalesce(sent_at, now())
   where lower(email) = lower(trim(p_email)) returning sent_at into v_sent;
  return v_sent;
end;
$$;

create or replace function public.admin_revoke_code(p_email text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.access_codes set is_active = false
   where lower(email) = lower(trim(p_email)) and redeemed_at is null;
  if not found then return 'No revocable (unredeemed) code for ' || p_email; end if;
  return 'Revoked code for ' || p_email;
end;
$$;

-- ─── 9. Admin cohort metrics ──────────────────────────────────
create or replace function public.admin_metrics()
returns json language plpgsql security definer set search_path = public as $$
declare v_feedback bigint := 0; v_blocks bigint := 0;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  begin execute 'select count(*) from public.feedback' into v_feedback;
  exception when undefined_table then v_feedback := 0; end;
  begin execute 'select count(distinct user_id) from public.planner_blocks' into v_blocks;
  exception when undefined_table then v_blocks := 0; end;
  return json_build_object(
    'waitlist',             (select count(*) from public.waitlist),
    'founder_interest_yes', (select count(*) from public.waitlist where founder_interest = 'yes'),
    'invited',              (select count(*) from public.access_codes),
    'redeemed',             (select count(*) from public.access_codes where redeemed_at is not null),
    'active_block_users',   v_blocks,
    'feedback',             v_feedback
  );
end;
$$;

-- ─── 10. Grants ───────────────────────────────────────────────
grant execute on function public.is_admin()                 to authenticated;
grant execute on function public.redeem_access_code(text)   to authenticated;
grant execute on function public.get_my_access()            to authenticated;
grant execute on function public.admin_waitlist()           to authenticated;
grant execute on function public.admin_generate_code(text)  to authenticated;
grant execute on function public.admin_mark_sent(text)      to authenticated;
grant execute on function public.admin_revoke_code(text)    to authenticated;
grant execute on function public.admin_metrics()            to authenticated;
