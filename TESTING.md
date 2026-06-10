# Big Picture Planner — pre-push test suite

Run these before every push. The goal: never ship a broken demo, a broken
sign-up/access path, or a layout that breaks on a phone.

## TL;DR

```bash
npm run preflight     # lint + unit tests + access smoke + production build
npm run test:e2e      # responsive demo/tour across 7 device profiles
```

Both green = safe to push. First time only: `npx playwright install` (downloads
the browser engines for the e2e tests).

---

## 1. `npm run preflight` (fast gate, ~10s)

Chains four checks; fails on the first problem:

| Step | What it catches |
|------|-----------------|
| `lint` | hook misuse, unused vars, impure render, etc. |
| `test` | unit tests for import parsing, sync core, account access |
| `smoke` | the Supabase access stack is wired and secure (see below) |
| `build` | TypeScript + production bundle compiles |

### The access smoke test (`npm run smoke`)
`scripts/smoke.access.mjs` hits Supabase with the public anon key and asserts:
- the waitlist accepts a public signup and the founder columns exist
- `get_my_access()` / `redeem_access_code()` exist and treat anon as
  unauthenticated (no access leaks)
- `admin_metrics()` / `admin_waitlist()` reject non-admins (RLS holds)

This is the automated guard for "can people sign up and get access". It is
read-only by default. To exercise the real write path (inserts a row, sends the
notification email): `SMOKE_WRITE=1 npm run smoke`.

---

## 2. `npm run test:e2e` (responsive + demo, ~12s)

`e2e/tour.spec.ts` runs against a **production preview build** (no React
StrictMode quirks) across real device descriptors defined in
`playwright.config.ts`:

| Profile | Engine |
|---------|--------|
| iPhone SE | WebKit (Safari) |
| iPhone 13 Mini | WebKit (Safari) |
| iPhone 15 Pro | WebKit (Safari) |
| iPhone 15 Pro Max | WebKit (Safari) |
| iPad Mini | WebKit (Safari) |
| Pixel 7 | Chromium (Chrome) |
| Desktop | Chromium |

Each profile asserts:
1. **Demo is ungated** — `/planner/?demo=1` loads the planner with no sign-in wall.
2. **Tour fits the viewport** — the spotlight card is fully on-screen, width ≤
   `min(90vw, 360px)`, the Skip/primary control is visible, and there is **no
   horizontal scrolling**.
3. **No 100vh overflow** — the app shell fits the viewport height (the mobile
   browser-chrome trap).

Debug a failure visually: `npx playwright test --project="iPhone SE" --headed`
or open `playwright-report/` after a run.

---

## 3. Manual checks (the things automation can't fully cover)

Do these on the **live site** after deploy (`bigpictureplanner.app`), hard-refresh first.

### A. Real-device responsive pass
On at least one real iPhone (Safari **and** Chrome) and one Android:
- Open `…/planner/?tour=1`, walk all 7 tour steps.
- Rotate portrait/landscape mid-tour — card and spotlight stay correct.
- Open the keyboard (the Quick Add step) — the card stays above the keyboard.
- Confirm: no clipped spotlight, no element off-screen, buttons clear of the
  home indicator.

### B. Sign-up → access (the full human path)
1. Landing → "Try the demo" → tour runs ungated.
2. Join the waitlist → you receive the notification email.
3. Invite Console → generate code → copy invite.
4. New incognito → open the planner → sign in with that email → enter the code →
   planner loads (no expiry).

### C. Google Calendar sync (see the verification note below)
- Connect Google Calendar as a **listed test user** → events import, edits push back.
- As a non-test user (pre-verification) you will be blocked — that is expected;
  see `docs/GOOGLE_OAUTH.md`.

---

## 4. When to run what

| Change | Run |
|--------|-----|
| Any code change | `npm run preflight` |
| Anything touching the tour, layout, mobile, or CSS | `npm run preflight && npm run test:e2e` |
| Anything touching access/auth/admin/Supabase | `npm run preflight` + manual B |
| Before a beta invite batch | all of the above + manual A & C on a real phone |
