-- ============================================================
-- Big Picture Planner — "new waitlist signup" email notification
-- Emails you (via Resend) whenever someone joins the waitlist, so you
-- never have to keep checking the Invite Console.
--
-- BEFORE RUNNING:
--   1. Replace RESEND_API_KEY_HERE below with a Resend API key (re_...).
--      Reuse the one from your SMTP setup, or create a new one at
--      resend.com -> API Keys (Sending access). Domain must be verified.
--   2. Paste the whole file into the Supabase SQL Editor and run it.
--
-- The email send is non-blocking: if Resend is down or the key is wrong,
-- the signup still succeeds (you just won't get that one notification).
-- ============================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_waitlist_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := 'RESEND_API_KEY_HERE';            -- <-- paste your re_... key
  v_to  text := 'lizziesoyode@gmail.com';          -- who gets notified
begin
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'from',    'Big Picture Planner <hello@bigpictureplanner.app>',
      'to',      jsonb_build_array(v_to),
      'subject', 'New founder waitlist signup: ' || coalesce(NEW.email, 'unknown'),
      'text',
        'Someone just joined the Big Picture Planner waitlist.' || E'\n\n' ||
        'Email: '                || coalesce(NEW.email, '')                  || E'\n' ||
        'Wants help planning: '  || coalesce(NEW.use_case, '(not answered)') || E'\n' ||
        'Currently plans with: ' || coalesce(NEW.current_method, '(not answered)') || E'\n' ||
        'Would pay £40 founder: '|| coalesce(NEW.founder_interest, '(not answered)') || E'\n' ||
        'Source: '               || coalesce(NEW.source, '')                 || E'\n' ||
        'Queue position: '       || coalesce(NEW.position::text, '')         || E'\n\n' ||
        'Review and invite from the console: https://bigpictureplanner.app/admin.html'
    )
  );
  return NEW;
end;
$$;

drop trigger if exists waitlist_signup_notify on public.waitlist;
create trigger waitlist_signup_notify
  after insert on public.waitlist
  for each row execute function public.notify_waitlist_signup();
