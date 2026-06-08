-- ============================================================
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable pg_net for calling Edge Functions from SQL
create extension if not exists pg_net with schema extensions;

-- ============================================================
-- 1. ACCESS CODES
-- ============================================================
create table if not exists public.access_codes (
  code          text primary key default upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  email         text not null,
  waitlist_position integer,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  redeemed_at   timestamptz,
  redeemed_by   uuid references auth.users(id),
  trial_ends_at timestamptz,
  is_active     boolean not null default true
);

comment on table public.access_codes is
  'One code per waitlist signup. Redeeming starts a 28-day trial.';

create index if not exists access_codes_email_idx on public.access_codes(email);

alter table public.access_codes enable row level security;

-- Users can look up their own code (to redeem it)
create policy "Users can redeem their own code"
  on public.access_codes
  for update
  using (auth.uid() = redeemed_by or redeemed_by is null)
  with check (auth.uid() = redeemed_by);

-- Users can read a code to validate it
create policy "Anyone can read an active code"
  on public.access_codes
  for select
  using (is_active = true);

-- ============================================================
-- 2. USER ACCESS (trial + paid status)
-- ============================================================
create table if not exists public.user_access (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  access_code   text references public.access_codes(code),
  trial_starts_at timestamptz not null default now(),
  trial_ends_at timestamptz not null,
  is_paid       boolean not null default false,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.user_access is
  'One row per user. Tracks trial window and paid status.';

alter table public.user_access enable row level security;

create policy "Users can read their own access"
  on public.user_access
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own access"
  on public.user_access
  for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- 3. FUNCTION: redeem_access_code(code)
--    Called from the app when user enters their code.
--    Returns 'ok', 'invalid', or 'already_used'.
-- ============================================================
create or replace function public.redeem_access_code(p_code text)
returns json
language plpgsql security definer
as $$
declare
  v_code record;
  v_user_id uuid := auth.uid();
begin
  -- Must be logged in
  if v_user_id is null then
    return json_build_object('status', 'unauthenticated');
  end if;

  -- Already has access?
  if exists (select 1 from public.user_access where user_id = v_user_id) then
    return json_build_object('status', 'already_has_access');
  end if;

  -- Look up the code
  select * into v_code
  from public.access_codes
  where code = upper(trim(p_code))
    and is_active = true
    and redeemed_by is null;

  if not found then
    return json_build_object('status', 'invalid');
  end if;

  -- Mark code as redeemed
  update public.access_codes
  set redeemed_by   = v_user_id,
      redeemed_at   = now(),
      trial_ends_at = now() + interval '28 days'
  where code = v_code.code;

  -- Create user access row
  insert into public.user_access (user_id, access_code, trial_ends_at)
  values (v_user_id, v_code.code, now() + interval '28 days');

  return json_build_object(
    'status', 'ok',
    'trial_ends_at', (now() + interval '28 days')::text
  );
end;
$$;

-- ============================================================
-- 4. FUNCTION: get_my_access()
--    Called from the app on login to check status.
--    Returns: { status: 'trial'|'expired'|'paid'|'no_access', trial_ends_at, days_remaining }
-- ============================================================
create or replace function public.get_my_access()
returns json
language plpgsql security definer
as $$
declare
  v_access record;
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

  if v_access.is_paid then
    return json_build_object('status', 'paid');
  end if;

  if v_access.trial_ends_at > now() then
    return json_build_object(
      'status', 'trial',
      'trial_ends_at', v_access.trial_ends_at::text,
      'days_remaining', greatest(0, extract(day from v_access.trial_ends_at - now()))::int
    );
  end if;

  return json_build_object(
    'status', 'expired',
    'trial_ends_at', v_access.trial_ends_at::text
  );
end;
$$;

-- ============================================================
-- 5. FUNCTION: send_trial_codes(from_pos, to_pos)
--    YOU call this when you're ready to invite a batch.
--    e.g. select send_trial_codes(1, 50);
-- ============================================================
create or replace function public.send_trial_codes(p_from integer, p_to integer)
returns text
language plpgsql security definer
as $$
declare
  v_row record;
  v_code text;
  v_sent integer := 0;
begin
  for v_row in
    select email, position
    from public.waitlist
    where position between p_from and p_to
    order by position
  loop
    -- Generate code if one doesn't exist for this email
    insert into public.access_codes (email, waitlist_position)
    values (v_row.email, v_row.position)
    on conflict do nothing
    returning code into v_code;

    -- If code already existed, fetch it
    if v_code is null then
      select code into v_code from public.access_codes where email = v_row.email;
    end if;

    -- Only send if not already sent
    if exists (select 1 from public.access_codes where email = v_row.email and sent_at is null) then
      -- Call the Edge Function to send the email
      perform net.http_post(
        url     := current_setting('app.edge_function_url') || '/send-trial-code',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key')
        ),
        body    := jsonb_build_object('email', v_row.email, 'code', v_code, 'position', v_row.position)
      );

      update public.access_codes set sent_at = now() where email = v_row.email;
      v_sent := v_sent + 1;
    end if;
  end loop;

  return 'Sent ' || v_sent || ' codes (positions ' || p_from || '-' || p_to || ')';
end;
$$;
