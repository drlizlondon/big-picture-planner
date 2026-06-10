# Google Calendar sync — why people get blocked, and how to fix it

## What happened
A beta user tried to connect Google Calendar and got an "access blocked / app
not verified / not authorised" screen. This is **not a bug in our code** — it is
Google's policy for unverified apps that request a *sensitive* scope.

We request `https://www.googleapis.com/auth/calendar.events` (read/write
calendar). Google treats that as **sensitive**, so until our OAuth app is
**verified**, only people we explicitly allow can authorise it.

There are two states a Google OAuth app can be in:

| Publishing status | Who can connect Calendar |
|-------------------|--------------------------|
| **Testing** (default) | Only emails added to the **Test users** list (max 100) |
| **In production, unverified** | Anyone, but they see a scary "Google hasn't verified this app" warning and must click *Advanced → Go to (unsafe)* |
| **In production, verified** | Anyone, clean consent screen |

## The immediate fix for beta (do this now)
Add each beta user's Google email as a **Test user**:

1. Google Cloud Console → the project → **APIs & Services → OAuth consent screen**
2. Scroll to **Test users → + Add users**
3. Add the person's Google address → Save
4. They retry "Connect Google Calendar" — it now works (they may still see a
   one-time "unverified app" notice and click through *Advanced*).

Up to **100 test users** are allowed. This is the right approach for a small,
controlled founder beta.

## Also check these (common causes of the same error)
- **Google Calendar API enabled**: APIs & Services → Library → search "Google
  Calendar API" → Enable.
- **Authorized redirect URI** includes Supabase's callback:
  `https://ovdrrltrhctwvtngjiaw.supabase.co/auth/v1/callback`
  (Cloud Console → Credentials → your OAuth 2.0 Client → Authorized redirect URIs).
- **Supabase Google provider** has the same Client ID/secret and the calendar
  scope is allowed.

## The real fix before public launch: get verified
Sensitive scopes need Google verification before you can take the app to
production for everyone. It takes time (days to weeks), so **start early**.
You'll need:
- A published **privacy policy** URL and **terms** URL on bigpictureplanner.app.
- **Domain verification** of bigpictureplanner.app in Google Search Console.
- App name, logo, support email, scope justification.
- Usually a short **demo video** showing the OAuth flow and why you need
  calendar access.

Submit via the OAuth consent screen → "Publish app" → verification flow.

## What the user sees in-app today
`connectGoogleCalendar()` (`src/services/supabaseClient.ts`) just starts the
OAuth redirect; the block happens on Google's side, so we can't catch it
precisely. If Google denies, the user returns without `provider_token` and the
panel shows "Could not connect Google Calendar." Consider adding a line in the
sync panel for beta: "Calendar sync is in limited beta — tell us your Google
email and we'll enable it for you." (Not built yet.)
