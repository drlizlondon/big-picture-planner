/**
 * Google Calendar bidirectional sync.
 *
 * Events are fetched from the Google Calendar API and stored in Dexie as
 * regular PlannerBlocks with:
 *   sourceType:               'calendar_import'
 *   metadata.source.provider: 'google_calendar'
 *   metadata.source.externalId: the raw Google event ID
 *
 * Block IDs are deterministic: `gcal_${eventId}` — so re-fetching is idempotent.
 *
 * Google Calendar events are NOT enqueued into the Supabase sync queue.
 * They are ephemeral local projections of the user's Google Calendar.
 * Write-backs (drag-to-reschedule) call the Google Calendar PATCH API directly.
 */

import { db } from '../db/db';
import { getCurrentSession } from './supabaseClient';
import type { PlannerBlock } from '../types/models';

const GCAL_API = 'https://www.googleapis.com/calendar/v3';
const SYNC_WINDOW_PAST_DAYS = 14;
const SYNC_WINDOW_FUTURE_DAYS = 28;
const GCAL_LAST_SYNC_KEY = 'googleCalendarLastSync';

export const GCAL_BLOCK_ID_PREFIX = 'gcal_';

// ─── Error type ───────────────────────────────────────────────────────────────

export class GCalError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'GCalError';
  }
}

export type GCalStatus = 'connected' | 'no_token' | 'unauthorized' | 'error' | 'not_checked';

export interface GCalSyncResult {
  status: GCalStatus;
  fetched: number;
  upserted: number;
  removed: number;
  lastSyncAt?: string;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

export const getGCalProviderToken = async (): Promise<string | null> => {
  const session = await getCurrentSession();
  // Supabase stores the Google access token as provider_token on the session
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (session as any)?.provider_token ?? null;
};

export const hasGCalAccess = async (): Promise<boolean> => {
  const token = await getGCalProviderToken();
  return !!token;
};

export const getLastSyncTime = async (): Promise<string | null> => {
  const meta = await db.syncMeta.get(GCAL_LAST_SYNC_KEY);
  return meta?.value ?? null;
};

// ─── API call helper ──────────────────────────────────────────────────────────

const gcalFetch = async (path: string, token: string, options?: RequestInit): Promise<unknown> => {
  const res = await fetch(`${GCAL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new GCalError(res.status, text);
  }

  return res.json();
};

// ─── Sync: fetch + store ──────────────────────────────────────────────────────

export const syncGoogleCalendarEvents = async (): Promise<GCalSyncResult> => {
  const token = await getGCalProviderToken();
  if (!token) {
    return { status: 'no_token', fetched: 0, upserted: 0, removed: 0 };
  }

  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - SYNC_WINDOW_PAST_DAYS);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + SYNC_WINDOW_FUTURE_DAYS);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawEvents: any[];
  try {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '500',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await gcalFetch(`/calendars/primary/events?${params}`, token) as any;
    rawEvents = data.items ?? [];
  } catch (err) {
    if (err instanceof GCalError && err.status === 401) {
      return { status: 'unauthorized', fetched: 0, upserted: 0, removed: 0 };
    }
    return { status: 'error', fetched: 0, upserted: 0, removed: 0 };
  }

  // Convert events to PlannerBlocks
  const incoming = rawEvents
    .map(googleEventToBlock)
    .filter((b): b is PlannerBlock => b !== null);

  const incomingIds = new Set(incoming.map(b => b.id));

  // Remove stale GCal blocks in the date window that weren't returned
  const dateMin = toDateString(timeMin);
  const dateMax = toDateString(timeMax);
  const existing = await db.blocks
    .where('date')
    .between(dateMin, dateMax, true, true)
    .filter(b => isGCalBlock(b) && !b.deletedAt)
    .toArray();

  const toRemove = existing.filter(b => !incomingIds.has(b.id));
  await Promise.all(toRemove.map(b => db.blocks.delete(b.id)));

  // Upsert all incoming events
  await db.blocks.bulkPut(incoming);

  const lastSyncAt = new Date().toISOString();
  await db.syncMeta.put({ key: GCAL_LAST_SYNC_KEY, value: lastSyncAt, updatedAt: Date.now() });

  return {
    status: 'connected',
    fetched: rawEvents.length,
    upserted: incoming.length,
    removed: toRemove.length,
    lastSyncAt,
  };
};

// ─── Write-back: PATCH a Google Calendar event ────────────────────────────────

export const patchGoogleCalendarEvent = async (
  eventId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<void> => {
  const token = await getGCalProviderToken();
  if (!token) throw new GCalError(401, 'No provider token — user must reconnect Google Calendar');

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const startDt = `${date}T${startTime}:00`;
  const endDt = `${date}T${endTime}:00`;

  await gcalFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      start: { dateTime: startDt, timeZone: tz },
      end: { dateTime: endDt, timeZone: tz },
    }),
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const isGCalBlock = (block: PlannerBlock): boolean =>
  block.metadata?.source?.provider === 'google_calendar';

export const getGCalEventId = (block: PlannerBlock): string | undefined =>
  block.metadata?.source?.externalId;

const toDateString = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const pad = (n: number) => String(n).padStart(2, '0');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const googleEventToBlock = (event: any): PlannerBlock | null => {
  // Skip all-day events, cancelled events, or events without a dateTime
  if (!event.start?.dateTime || !event.end?.dateTime) return null;
  if (event.status === 'cancelled') return null;

  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (durationMinutes <= 0) return null;

  const date = toDateString(start);
  const startTimeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const endTimeStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`;

  return {
    id: `${GCAL_BLOCK_ID_PREFIX}${event.id}`,
    title: event.summary || '(No title)',
    description: event.description,
    durationMinutes,
    date,
    startTime: startTimeStr,
    endTime: endTimeStr,
    isScheduled: true,
    isBaseEvent: false,
    isHidden: false,
    sourceType: 'calendar_import',
    metadata: {
      source: {
        provider: 'google_calendar',
        name: 'Google Calendar',
        externalId: event.id,
        importedAt: Date.now(),
      },
      labelIds: [],
      systemTags: ['imported'],
      viewIds: [],
    },
    categoryId: undefined,
    templateId: undefined,
    travelEnabled: false,
    travelBeforeMinutes: 0,
    travelAfterMinutes: 0,
    additionalTimezone: undefined,
    features: {},
    reviewColour: undefined,
    importSource: 'Google Calendar',
    // Store the Google Calendar event link so we can link out to it
    importRawLine: event.htmlLink,
    createdAt: start.getTime(),
    updatedAt: Date.now(),
    deletedAt: undefined,
  };
};
