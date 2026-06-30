/**
 * analytics.ts — one typed entry point for every meaningful product event.
 *
 * Design goals (from the repositioning brief):
 *  - Every important user action emits a *typed* event, so the taxonomy is
 *    discoverable and refactor-safe (no stringly-typed call sites).
 *  - Events are grouped into acquisition / activation / engagement / retention /
 *    feedback / auth, mirroring how we reason about the funnel.
 *  - Storage is pluggable: today we write to a Supabase table, but a PostHog (or
 *    any other) provider can be registered later via `setAnalyticsProvider`
 *    WITHOUT touching a single call site.
 *  - We attach a stable anonymous client id, a per-load session id, device type
 *    and (when signed in) the user id automatically. No unnecessary PII.
 *
 * Usage:  track({ type: 'task_created', isFirst: true })
 */

import { getCurrentSession, getSupabaseClient } from './supabaseClient';

// ─── Event taxonomy ──────────────────────────────────────────────────────────
// Each event is a discriminated union member keyed by `type`. Extra fields on a
// member become `props` on the stored row. Keep names snake_case and stable —
// they are the analytics contract.

export type AnalyticsEvent =
  // Acquisition (mostly fired from the landing pages; included here so the
  // vocabulary is shared and the app can emit them too if it ever hosts a page).
  | { type: 'landing_page_viewed'; page: string; referrer?: string; variant?: string }
  // Activation — the first-time milestones that signal a user "got it".
  | { type: 'planner_opened' }
  | { type: 'first_task_created' }
  | { type: 'first_drag_completed' }
  | { type: 'first_week_planned' }
  | { type: 'life_inbox_used' }
  | { type: 'calendar_view_changed'; view: string }
  // Engagement — repeatable signals of ongoing use.
  | { type: 'session_start'; returning: boolean; daysSinceLast?: number }
  | { type: 'task_created'; scheduled: boolean }
  | { type: 'drag_completed'; target: 'week' | 'inbox' | 'day' | 'month' }
  | { type: 'view_changed'; view: string }
  // Feedback.
  | { type: 'feedback_opened' }
  | { type: 'feedback_submitted'; mode: 'quick' | 'structured'; rating?: number }
  // Auth (framed as saving progress, not joining).
  | { type: 'sign_in_started'; method: 'apple' | 'google' | 'email' }
  | { type: 'planner_saved'; method: 'apple' | 'google' | 'email' };

// ─── Provider abstraction ────────────────────────────────────────────────────

export interface AnalyticsProvider {
  capture(name: string, props: Record<string, unknown>): void;
}

/** Console provider — used in dev or when no backend is configured. */
const consoleProvider: AnalyticsProvider = {
  capture(name, props) {
    console.debug('[analytics]', name, props);
  },
};

/**
 * Supabase provider — fire-and-forget insert into public.analytics_events.
 * Errors are swallowed: analytics must never break the app or block a click.
 */
const supabaseProvider: AnalyticsProvider = {
  capture(name, props) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase
      .from('analytics_events')
      .insert({
        event: name,
        props,
        client_id: getClientId(),
        session_id: sessionId,
        user_id: currentUserId,
        device_type: getDeviceType(),
        source: acquisition.source ?? null,
      })
      .then(({ error }) => {
        if (error) console.debug('[analytics] insert failed:', error.message);
      });
  },
};

let provider: AnalyticsProvider = getSupabaseClient() ? supabaseProvider : consoleProvider;

/** Swap the backend (e.g. a future PostHog provider) without changing call sites. */
export const setAnalyticsProvider = (next: AnalyticsProvider): void => {
  provider = next;
};

// ─── Identity & context ──────────────────────────────────────────────────────

const CLIENT_ID_KEY = 'bpp_client_id';
const LAST_SEEN_KEY = 'bpp_last_seen';
const FIRST_FLAG_PREFIX = 'bpp_first_';

const uuid = (): string => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
};

const getClientId = (): string => {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
};

const sessionId = uuid();

const getDeviceType = (): 'mobile' | 'tablet' | 'desktop' => {
  try {
    const w = window.innerWidth;
    if (w < 640) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  } catch {
    return 'desktop';
  }
};

/** Capture acquisition context once at load (src param / UTM / referrer). */
const readAcquisition = (): { source?: string } => {
  try {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('src') ?? params.get('utm_source') ?? undefined;
    return { source: source ?? undefined };
  } catch {
    return {};
  }
};
const acquisition = readAcquisition();

// User id is kept in module scope and updated from Supabase auth state so the
// fire-and-forget insert never has to await a session lookup.
let currentUserId: string | null = null;

let initialised = false;
/**
 * Initialise analytics identity + emit the per-session `session_start` event
 * (with returning-user detection). Safe to call multiple times; runs once.
 */
export const initAnalytics = (): void => {
  if (initialised) return;
  initialised = true;

  // Track the signed-in user id for attribution.
  void getCurrentSession().then((s) => { currentUserId = s?.user?.id ?? null; });
  getSupabaseClient()?.auth.onAuthStateChange((_evt, session) => {
    currentUserId = session?.user?.id ?? null;
  });

  // Returning-user / session detection via last-seen timestamp.
  let returning = false;
  let daysSinceLast: number | undefined;
  try {
    const last = localStorage.getItem(LAST_SEEN_KEY);
    if (last) {
      returning = true;
      daysSinceLast = Math.floor((Date.now() - Number(last)) / 86400000);
    }
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
  } catch { /* ignore */ }

  track({ type: 'session_start', returning, daysSinceLast });
};

// ─── Public API ──────────────────────────────────────────────────────────────

/** Emit a typed analytics event. Never throws. */
export const track = (event: AnalyticsEvent): void => {
  try {
    const { type, ...props } = event;
    provider.capture(type, props as Record<string, unknown>);
  } catch {
    // analytics is best-effort
  }
};

/**
 * Emit `event` only the first time this client does the thing. Used for the
 * activation milestones (first_task_created, first_drag_completed, …).
 * Returns true if it fired.
 */
export const trackOnce = (key: string, event: AnalyticsEvent): boolean => {
  try {
    const flag = FIRST_FLAG_PREFIX + key;
    if (localStorage.getItem(flag)) return false;
    localStorage.setItem(flag, '1');
    track(event);
    return true;
  } catch {
    track(event);
    return false;
  }
};
