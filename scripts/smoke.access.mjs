/**
 * Access / sign-up plumbing smoke test (no browser, no real login).
 *
 * Verifies the Supabase access stack is wired and secure:
 *   - waitlist accepts a public signup (with the founder fields)
 *   - the access RPCs exist and are callable
 *   - unauthenticated callers are treated as such (not granted access)
 *   - admin-only RPCs reject anonymous callers (RLS / is_admin guard)
 *
 * Run:  node scripts/smoke.access.mjs
 * Uses the public anon key (same one shipped in the frontend).
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ovdrrltrhctwvtngjiaw.supabase.co';
const ANON = process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92ZHJybHRyaGN0d3Z0bmdqaWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTE1ODMsImV4cCI6MjA5NjQ4NzU4M30.8c5_67GeGFIxXb11E9D4wGy5j37yeOD8ULMRDDSjXJs';

const h = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };
let pass = 0, fail = 0;
const ok = (name) => { console.log(`  ✓ ${name}`); pass++; };
const bad = (name, detail) => { console.log(`  ✗ ${name}\n      ${detail}`); fail++; };

const rpc = async (fn, body = {}) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch { /* no body */ }
  return { status: r.status, data };
};

const run = async () => {
  console.log('Access / sign-up smoke test\n');

  // 1. Public waitlist signup with founder fields.
  // Gated behind SMOKE_WRITE=1 because inserting a row fires the notification
  // email and leaves data. Run `SMOKE_WRITE=1 node scripts/smoke.access.mjs`
  // when you specifically want to exercise the real write path.
  if (process.env.SMOKE_WRITE === '1') {
    try {
      const email = `smoke-${Date.now()}@bigpictureplanner.app`;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
        method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify({ email, source: 'smoke-test', use_case: 'smoke', current_method: 'smoke', founder_interest: 'maybe' }),
      });
      if (r.status === 201) ok('waitlist accepts a public signup (incl. founder fields)');
      else bad('waitlist signup', `expected 201, got ${r.status} — did founder.sql / setup.sql run?`);
    } catch (e) { bad('waitlist signup', String(e)); }
  } else {
    // Read-only schema check: confirm the founder columns exist.
    const r = await fetch(`${SUPABASE_URL}/rest/v1/waitlist?select=founder_interest,use_case,current_method&limit=0`, { headers: h });
    if (r.status === 200) ok('waitlist founder columns present (read-only check)');
    else bad('waitlist founder columns', `status ${r.status} — did founder.sql / setup.sql run? (admin read may be required)`);
  }

  // 2. get_my_access exists + treats anon as unauthenticated
  {
    const { status, data } = await rpc('get_my_access');
    if (status === 200 && data?.status === 'unauthenticated') ok('get_my_access() callable; anon = unauthenticated');
    else bad('get_my_access()', `status=${status} body=${JSON.stringify(data)}`);
  }

  // 3. redeem_access_code exists + rejects anon
  {
    const { status, data } = await rpc('redeem_access_code', { p_code: 'SMOKE0000' });
    if (status === 200 && data?.status === 'unauthenticated') ok('redeem_access_code() callable; anon rejected');
    else bad('redeem_access_code()', `status=${status} body=${JSON.stringify(data)}`);
  }

  // 4. admin_metrics rejects anonymous callers (security)
  {
    const { status, data } = await rpc('admin_metrics');
    const msg = JSON.stringify(data || '');
    if (status >= 400 || msg.includes('not authorized')) ok('admin_metrics() blocks non-admins');
    else bad('admin_metrics() SECURITY', `anon was NOT blocked: status=${status} body=${msg}`);
  }

  // 5. admin_waitlist rejects anonymous callers (security)
  {
    const { status, data } = await rpc('admin_waitlist');
    const msg = JSON.stringify(data || '');
    if (status >= 400 || msg.includes('not authorized')) ok('admin_waitlist() blocks non-admins');
    else bad('admin_waitlist() SECURITY', `anon was NOT blocked: status=${status} body=${msg}`);
  }

  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
