-- ============================================================
-- Big Picture Planner — Admin / Invite Console backend
-- Run this in Supabase SQL Editor (after waitlist.sql + access.sql)
--
-- Powers the curated manual-invite flow used by /admin.html:
--   1. Review waitlist signups + their invite status
--   2. Generate a unique, single-use access code for a chosen email
--   3. Mark a code as "sent" once you've emailed the invite
--
-- Codes are already single-use (see redeem_access_code in access.sql:
-- it only accepts a code where redeemed_by IS NULL) and the 28-day
-- trial starts at REDEMPTION, not at waitlist signup.
-- ============================================================

-- ─── 0. Who counts as an admin ────────────────────────────────
-- Add more emails to this list if you bring on a teammate.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') in (
      'lizziesoyode@gmail.com'
    ),
    false
  );
$$;

comment on function public.is_admin is
  'True when the signed-in user is an allow-listed admin (by email).';

-- ─── 1. Lock down the waitlist to admins only ─────────────────
-- Previously ANY authenticated user (e.g. a trial user) could read the
-- entire waitlist of emails. Replace that with an admin-only policy.
drop policy if exists "Authenticated users can read waitlist" on public.waitlist;

drop policy if exists "Admins can read waitlist" on public.waitlist;
create policy "Admins can read waitlist"
  on public.waitlist
  for select
  using (public.is_admin());

-- ─── 2. List the waitlist with invite status ──────────────────
-- Returns one row per waitlist signup, joined to any code they have.
--   status: 'pending'  → no code generated yet
--           'invited'  → code generated (and possibly emailed)
--           'redeemed' → user has signed in and redeemed the code
create or replace function public.admin_waitlist()
returns table (
  "position"    integer,
  email         text,
  name          text,
  signed_up_at  timestamptz,
  code          text,
  code_sent_at  timestamptz,
  redeemed_at   timestamptz,
  status        text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    w.position,
    w.email,
    w.name,
    w.signed_up_at,
    c.code,
    c.sent_at,
    c.redeemed_at,
    case
      when c.redeemed_at is not null then 'redeemed'
      when c.code is not null        then 'invited'
      else                                'pending'
    end as status
  from public.waitlist w
  left join public.access_codes c on lower(c.email) = lower(w.email)
  order by w.position nulls last, w.signed_up_at;
end;
$$;

comment on function public.admin_waitlist is
  'Admin-only: waitlist signups joined with their invite/redemption status.';

-- ─── 3. Generate (or fetch) a unique code for one email ───────
-- Idempotent: if the email already has a code, returns the existing one
-- instead of minting a second. One code per email.
create or replace function public.admin_generate_code(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text;
  v_pos   integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  p_email := lower(trim(p_email));
  if p_email is null or p_email = '' then
    raise exception 'email required';
  end if;

  -- Already has a code? Return it (idempotent).
  select code into v_code
  from public.access_codes
  where lower(email) = p_email
  limit 1;

  if v_code is not null then
    return v_code;
  end if;

  -- Grab their waitlist position if they have one.
  select position into v_pos
  from public.waitlist
  where lower(email) = p_email
  limit 1;

  insert into public.access_codes (email, waitlist_position)
  values (p_email, v_pos)
  returning code into v_code;

  return v_code;
end;
$$;

comment on function public.admin_generate_code is
  'Admin-only: mint (or fetch existing) single-use access code for an email.';

-- ─── 4. Mark a code as sent ───────────────────────────────────
-- Call after you''ve emailed the invite, so the console shows it as sent.
create or replace function public.admin_mark_sent(p_email text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  update public.access_codes
  set sent_at = coalesce(sent_at, now())
  where lower(email) = lower(trim(p_email))
  returning sent_at into v_sent;

  return v_sent;
end;
$$;

comment on function public.admin_mark_sent is
  'Admin-only: stamp sent_at on a code once the invite email has gone out.';

-- ─── 5. Revoke a code (optional safety valve) ─────────────────
-- Deactivates an unredeemed code (e.g. wrong email, spam signup).
-- Will NOT revoke a code that has already been redeemed.
create or replace function public.admin_revoke_code(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  update public.access_codes
  set is_active = false
  where lower(email) = lower(trim(p_email))
    and redeemed_at is null;

  if not found then
    return 'No revocable (unredeemed) code for ' || p_email;
  end if;
  return 'Revoked code for ' || p_email;
end;
$$;

comment on function public.admin_revoke_code is
  'Admin-only: deactivate an unredeemed code.';

-- ─── 6. Grant execute to authenticated users ──────────────────
-- The functions self-check is_admin() internally, so this is safe:
-- non-admins calling them just get "not authorized".
grant execute on function public.admin_waitlist()        to authenticated;
grant execute on function public.admin_generate_code(text) to authenticated;
grant execute on function public.admin_mark_sent(text)   to authenticated;
grant execute on function public.admin_revoke_code(text) to authenticated;
grant execute on function public.is_admin()              to authenticated;
