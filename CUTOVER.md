# Cutover to bigpictureplanner.app

The repo is now a single site that builds to:

```
bigpictureplanner.app/            -> landing (index.html)
bigpictureplanner.app/adhd.html   -> ADHD landing
bigpictureplanner.app/parents.html-> Parents landing
bigpictureplanner.app/feedback.html
bigpictureplanner.app/admin.html  -> invite console
bigpictureplanner.app/planner/    -> the planner app
```

The gh-pages branch already has this structure + a CNAME file. Do the steps
below **in order** to go live. The app only works at the new domain (its base
is `/planner/`), so the old `drlizlondon.github.io/big-picture-planner/` URL
stops working at cutover — that's expected.

---

## 1. Add DNS records (do this first — it propagates while you do the rest)

At your registrar for **bigpictureplanner.app**:

**Website (GitHub Pages apex):**

| Type | Host/Name | Value |
|------|-----------|-------|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `drlizlondon.github.io.` |

**Email (Resend)** — copy the exact records Resend shows when you add the
domain (region-specific). They sit on different hostnames (`send`,
`resend._domainkey`) so they do NOT conflict with the web records above.

---

## 2. Point the GitHub Pages custom domain

GitHub → repo **big-picture-planner** → **Settings → Pages**:
- Source: Deploy from branch `gh-pages` (already the case).
- **Custom domain** should already show `bigpictureplanner.app` (read from the
  CNAME file). If not, type it and Save.
- Wait for the DNS check to go green, then tick **Enforce HTTPS** (the cert can
  take a few minutes to provision).

---

## 3. Update Supabase auth URLs

Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://bigpictureplanner.app`
- **Redirect URLs:** add (or use the wildcard):
  - `https://bigpictureplanner.app/**`
  - (explicit, if you prefer no wildcard:)
    - `https://bigpictureplanner.app/planner/`
    - `https://bigpictureplanner.app/admin.html`
    - `https://bigpictureplanner.app/feedback.html`

This makes Google + magic-link sign-in redirect back to the new domain on the
planner AND the admin console.

---

## 4. Verify

- `https://bigpictureplanner.app/` → landing loads
- `https://bigpictureplanner.app/planner/` → planner app loads, sign-in works
- `https://bigpictureplanner.app/planner/?tour=1` → demo runs, ungated
- `https://bigpictureplanner.app/admin.html` → invite console, Google sign-in
- Refresh on `https://bigpictureplanner.app/planner/account` → does NOT 404

---

## 5. Tidy up (optional, after the new domain is confirmed working)

- The old **bigpictureplanner-landing** repo is now redundant. You can disable
  its GitHub Pages (Settings → Pages → Source: None) so there aren't two copies
  of the landing floating around. Keep the repo or archive it.
- Anything you previously sent pointing at `drlizlondon.github.io/...` now needs
  the new URL. The invite console already generates new-domain links, so future
  invites are fine.
