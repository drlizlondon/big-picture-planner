# Sign-in emails via Resend (custom SMTP for Supabase)

**Why:** Supabase's built-in email service only sends a few auth emails per
hour across the whole project ("email rate limit exceeded"). Connecting Resend
as custom SMTP lifts that so magic-link sign-in works reliably for every beta
user. Free tier = 3,000 emails/month, 100/day — plenty for a beta.

This affects **both** the planner sign-in *and* the admin console magic link.

---

## Step 0 — Prerequisite: a domain you control

Resend can only send to *other people* once you've **verified a domain** (e.g.
`bigpictureplanner.app`). You need access to that domain's DNS settings (where
you bought it — Namecheap, Cloudflare, GoDaddy, etc.).

> ⚠️ Without a verified domain, Resend's test sender (`onboarding@resend.dev`)
> can **only email your own account** — useless for inviting users. So a domain
> is required for real onboarding. If you don't own one yet, buy it first
> (bigpictureplanner.app was already the plan).

---

## Step 1 — Create a Resend account

1. Go to https://resend.com → **Sign up** (free).
2. Verify your own email to activate the account.

---

## Step 2 — Add & verify your domain

1. In Resend: **Domains → Add Domain** → enter `bigpictureplanner.app`.
2. Resend shows a set of **DNS records** (usually 3): an `MX`, and two `TXT`
   records (SPF + DKIM). Sometimes a `DMARC` TXT too.
3. Go to your domain registrar's DNS panel and **add each record exactly** as
   shown (name/host, type, value).
4. Back in Resend, click **Verify**. DNS can take a few minutes to a couple of
   hours. Status goes green when done.

---

## Step 3 — Create an API key

1. In Resend: **API Keys → Create API Key**.
2. Name it `supabase-smtp`, permission **Sending access**.
3. Copy the key (starts with `re_...`). You'll only see it once — paste it
   somewhere safe for the next step.

---

## Step 4 — Plug it into Supabase

In the Supabase dashboard for project `ovdrrltrhctwvtngjiaw`:

1. **Authentication → Emails → SMTP Settings** (older UIs: Project Settings →
   Auth → SMTP).
2. Toggle **Enable Custom SMTP** on.
3. Fill in:

   | Field | Value |
   |-------|-------|
   | **Host** | `smtp.resend.com` |
   | **Port** | `465` |
   | **Username** | `resend` |
   | **Password** | your `re_...` API key from Step 3 |
   | **Sender email** | `hello@bigpictureplanner.app` *(must be on the verified domain)* |
   | **Sender name** | `Big Picture Planner` |

4. **Save**.

---

## Step 5 — Raise the auth rate limits

Custom SMTP isn't throttled by the built-in cap, but Supabase still has its own
safety limit you can now raise:

1. **Authentication → Rate Limits**.
2. Increase **"Rate limit for sending emails"** from the default (~2–4/hour) to
   something comfortable for a beta, e.g. **30–60 per hour**.
3. Save.

---

## Step 6 — Test it

1. Open the admin console:
   `https://drlizlondon.github.io/bigpictureplanner-landing/admin.html`
2. Use the **email** sign-in (not Google) → you should get the link with **no**
   rate-limit error, sent from `hello@bigpictureplanner.app`.
3. Optional: have a non-Google friend try the planner's "Email me a sign-in
   link" — it should now arrive reliably.

---

## (Optional) Step 7 — Branded email copy

Supabase → **Authentication → Emails → Templates** lets you customise the
"Magic Link" and "Confirm signup" emails (subject + body) so they say
"Big Picture Planner" rather than the generic default. Nice-to-have, not
required.

---

### Notes
- Google sign-in never touches email, so it always works regardless of any of
  this — keep recommending it as the fast path.
- The redirect URLs (admin.html, the planner) should already be in
  **Authentication → URL Configuration → Redirect URLs**. If sign-in bounces to
  the homepage, that's the thing to check.
