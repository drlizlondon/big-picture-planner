-- ============================================================
-- Big Picture Planner — Access & Trial System
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable pg_net for calling Edge Functions from SQL
create extension if not exists pg_net with schema extensions;

-- ============================================================
-- 1. ACCESS CODES
--    One code per waitlist signup. Redeeming starts a 28-day trial.
-- ============================================================
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

comment on table public.access_codes is
  'One code per invited user. Redeeming starts a 28-day trial.';

create index if not exists access_codes_email_idx on public.access_codes(email);

alter table public.access_codes enable row level security;

create policy "Anyone can read an active code"
  on public.access_codes for select
  using (is_active = true);

create policy "Users can redeem their own code"
  on public.access_codes for update
  using (auth.uid() = redeemed_by or redeemed_by is null)
  with check (auth.uid() = redeemed_by);

-- ============================================================
-- 2. USER ACCESS
--    One row per user. Tracks trial, paid status, and refund window.
-- ============================================================
create table if not exists public.user_access (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  access_code          text references public.access_codes(code),

  -- Trial
  trial_starts_at      timestamptz not null default now(),
  trial_ends_at        timestamptz not null,

  -- Payment
  is_paid              boolean not null default false,
  paid_at              timestamptz,
  refund_window_ends_at timestamptz,   -- paid_at + 7 days
  stripe_payment_id    text,           -- for refund lookups

  -- Admin overrides
  is_comped            boolean not null default false,
  comp_note            text,           -- e.g. "press access" or "friend"
  granted_by_admin     boolean not null default false,

  created_at           timestamptz not null default now()
);

comment on table public.user_access is
  'One row per user. Controls what they can access and when.';

alter table public.user_access enable row level security;

create policy "Users can read their own access"
  on public.user_access for select
  using (auth.uid() = user_id);

create policy "Users can insert their own access"
  on public.user_access for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- 3. RPC: redeem_access_code(code)
--    Called from the app when user enters their code.
-- ============================================================
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

  -- Already has access?
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
      trial_ends_at = now() + interval '28 days'
  where code = v_code.code;

  insert into public.user_access (user_id, access_code, trial_ends_at)
  values (v_user_id, v_code.code, now() + interval '28 days');

  return json_build_object(
    'status', 'ok',
    'trial_ends_at', (now() + interval '28 days')::text
  );
end;
$$;

-- ============================================================
-- 4. RPC: get_my_access()
--    Called from the app on every login.
--    Returns status, trial info, and refund window.
-- ============================================================
create or replace function public.get_my_access()
returns json
language plpgsql security definer
as $$
declare
  v_access  record;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return json_build_object('status', 'unauthenticated');
  end if;

  select * into v_access
  from public.user_access
  where user_id = v_user_id;

  if not found then
    return json_build_object('status', 'no_access');
  end if;

  -- Paid
  if v_access.is_paid then
    return json_build_object(
      'status', 'paid',
      'in_refund_window', (v_access.refund_window_ends_at is not null and v_access.refund_window_ends_at > now()),
      'refund_window_ends_at', v_access.refund_window_ends_at::text
    );
  end if;

  -- Comped (admin granted)
  if v_access.is_comped then
    if v_access.trial_ends_at > now() then
      return json_build_object(
        'status', 'comped',
        'trial_ends_at', v_access.trial_ends_at::text,
        'days_remaining', greatest(0, extract(day from v_access.trial_ends_at - now()))::int
      );
    else
      return json_build_object('status', 'expired');
    end if;
  end if;

  -- Active trial
  if v_access.trial_ends_at > now() then
    return json_build_object(
      'status', 'trial',
      'trial_ends_at', v_access.trial_ends_at::text,
      'days_remaining', greatest(0, extract(day from v_access.trial_ends_at - now()))::int
    );
  end if;

  -- Expired
  return json_build_object(
    'status', 'expired',
    'trial_ends_at', v_access.trial_ends_at::text
  );
end;
$$;

-- ============================================================
-- 5. ADMIN: grant_paid_access(email, stripe_payment_id)
--    Run manually for anyone who pays directly.
--    e.g. SELECT grant_paid_access('jane@example.com', 'pi_xxx');
-- ============================================================
create or replace function public.grant_paid_access(
  p_email           text,
  p_stripe_payment_id text default null
)
returns text
language plpgsql security definer
as $$
declare
  v_user_id uuid;
begin
  -- Find user by email
  select id into v_user_id
  from auth.users
  where email = lower(trim(p_email));

  if v_user_id is null then
    return 'Error: no user found with email ' || p_email;
  end if;

  insert into public.user_access (
    user_id, trial_ends_at, is_paid, paid_at, refund_window_ends_at,
    stripe_payment_id, granted_by_admin
  )
  values (
    v_user_id,
    now() + interval '100 years',  -- effectively permanent
    true,
    now(),
    now() + interval '7 days',
    p_stripe_payment_id,
    true
  )
  on conflict (user_id) do update set
    is_paid               = true,
    paid_at               = now(),
    refund_window_ends_at = now() + interval '7 days',
    stripe_payment_id     = p_stripe_payment_id,
    trial_ends_at         = now() + interval '100 years';

  return 'Paid access granted to ' || p_email || ' (refund window closes ' || (now() + interval '7 days')::date::text || ')';
end;
$$;

-- ============================================================
-- 6. ADMIN: grant_comp_access(email, days, note)
--    Give someone free access for N days (press, friends, etc.)
--    e.g. SELECT grant_comp_access('friend@example.com', 90, 'beta tester');
-- ============================================================
create or replace function public.grant_comp_access(
  p_email text,
  p_days  integer default 28,
  p_note  text default null
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
    user_id, trial_ends_at, is_comped, comp_note, granted_by_admin
  )
  values (
    v_user_id,
    now() + (p_days || ' days')::interval,
    true,
    p_note,
    true
  )
  on conflict (user_id) do update set
    is_comped     = true,
    trial_ends_at = now() + (p_days || ' days')::interval,
    comp_note     = p_note;

  return 'Comp access granted to ' || p_email || ' for ' || p_days || ' days';
end;
$$;

-- ============================================================
-- 7. ADMIN: send_trial_codes(from_pos, to_pos)
--    Trigger a batch of invite emails.
--    e.g. SELECT send_trial_codes(1, 50);
--         SELECT send_trial_codes(51, 200);
-- ============================================================
create or replace function public.send_trial_codes(p_from integer, p_to integer)
returns text
language plpgsql security definer
as $$
declare
  v_row   record;
  v_code  text;
  v_sent  integer := 0;
begin
  for v_row in
    select email, position
    from public.waitlist
    where position between p_from and p_to
    order by position
  loop
    -- Generate code if one doesn't exist
    insert into public.access_codes (email, waitlist_position)
    values (v_row.email, v_row.position)
    on conflict do nothing
    returning code into v_code;

    if v_code is null then
      select code into v_code from public.access_codes where email = v_row.email;
    end if;

    -- Only send if not already sent
    if exists (
      select 1 from public.access_codes
      where email = v_row.email and sent_at is null
    ) then
      perform net.http_post(
        url     := current_setting('app.edge_function_url') || '/send-trial-code',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key')
        ),
        body    := jsonb_build_object(
          'email',    v_row.email,
          'code',     v_code,
          'position', v_row.position
        )
      );

      update public.access_codes set sent_at = now() where email = v_row.email;
      v_sent := v_sent + 1;
    end if;
  end loop;

  return 'Sent ' || v_sent || ' codes (positions ' || p_from || '-' || p_to || ')';
end;
$$;

-- ============================================================
-- HANDY ADMIN QUERIES (save these somewhere)
-- ============================================================

-- See everyone on the waitlist:
-- SELECT position, email, signed_up_at FROM public.waitlist ORDER BY position;

-- Send codes to first 50:
-- SELECT send_trial_codes(1, 50);

-- Send next batch:
-- SELECT send_trial_codes(51, 200);

-- Give someone paid access immediately:
-- SELECT grant_paid_access('jane@example.com');

-- Comp someone (press, friend, tester):
-- SELECT grant_comp_access('friend@example.com', 90, 'beta tester');

-- See all access statuses:
-- SELECT u.email, a.is_paid, a.is_comped, a.trial_ends_at, a.paid_at
-- FROM public.user_access a
-- JOIN auth.users u ON u.id = a.user_id
-- ORDER BY a.created_at;
