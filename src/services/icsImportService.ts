/**
 * Apple Calendar / iCalendar (.ics) import.
 *
 * Parses a .ics file and converts VEVENT entries into PlannerBlocks.
 * Events are stored as calendar_import blocks with:
 *   metadata.source.provider: 'apple_calendar'
 *
 * This is a one-way, manual import — not live sync.
 * IDs are deterministic: `ics_${uid}` so re-importing the same file is idempotent.
 * Events are NOT enqueued to Supabase sync queue (same as GCal events).
 */

import { db } from '../db/db';
import type { PlannerBlock } from '../types/models';

export const ICS_BLOCK_ID_PREFIX = 'ics_';
const DEFAULT_ICS_CALENDAR_NAME = 'Apple Calendar';

export interface IcsImportResult {
  imported: number;
  skipped: number;        // all-day, cancelled, unparseable
  deduplicated: number;   // already existed in DB
  blocks: PlannerBlock[];
}

/** Parsed-but-not-yet-committed import, so the UI can apply a tag/name first (req #7). */
export interface IcsParseResult {
  /** Source calendar name detected from the file (X-WR-CALNAME), editable by the user. */
  calendarName: string;
  /** Stable id for the source calendar, used as the import-preference key. */
  externalCalendarId: string;
  blocks: PlannerBlock[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const isIcsBlock = (block: PlannerBlock): boolean =>
  block.metadata?.source?.provider === 'apple_calendar';

/**
 * Parse a .ics file without writing anything, returning the detected calendar
 * name and the parsed blocks. Callers can apply an import preference (category,
 * tag, target, name) before committing with {@link commitIcsImport}.
 */
export const parseIcsFile = async (file: File): Promise<IcsParseResult> => {
  const text = await file.text();
  const calendarName = getIcsCalendarName(text) ?? DEFAULT_ICS_CALENDAR_NAME;
  const externalCalendarId = calendarName.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'apple_calendar';
  const blocks = parseIcs(text, calendarName, externalCalendarId);
  return { calendarName, externalCalendarId, blocks };
};

/** Persist already-parsed (and possibly preference-adjusted) blocks, de-duplicating by id. */
export const commitIcsImport = async (blocks: PlannerBlock[]): Promise<IcsImportResult> => {
  if (blocks.length === 0) {
    return { imported: 0, skipped: 0, deduplicated: 0, blocks: [] };
  }

  const existingIds = new Set(
    (await db.blocks.bulkGet(blocks.map(b => b.id)))
      .filter(Boolean)
      .map(b => b!.id)
  );

  const toInsert = blocks.filter(b => !existingIds.has(b.id));
  await db.blocks.bulkPut(toInsert);

  return {
    imported: toInsert.length,
    skipped: 0,
    deduplicated: existingIds.size,
    blocks: toInsert,
  };
};

/** One-shot import (parse + commit) with no preference step — kept for callers that don't need the picker. */
export const importIcsFile = async (file: File): Promise<IcsImportResult> => {
  const { blocks } = await parseIcsFile(file);
  return commitIcsImport(blocks);
};

const getIcsCalendarName = (text: string): string | undefined => {
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return unfolded.match(/^X-WR-CALNAME(?:;[^:]*)?:(.*)$/mi)?.[1]?.trim() || undefined;
};

// ─── Parser ───────────────────────────────────────────────────────────────────

const parseIcs = (text: string, calendarName: string, externalCalendarId: string): PlannerBlock[] => {
  // Unfold lines (RFC 5545 §3.1 — lines can be continued with CRLF + whitespace)
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const events: PlannerBlock[] = [];
  const rawEvents = unfolded.split('BEGIN:VEVENT').slice(1);

  for (const rawEvent of rawEvents) {
    const block = parseVEvent(rawEvent, calendarName, externalCalendarId);
    if (block) events.push(block);
  }

  return events;
};

const parseVEvent = (raw: string, calendarName: string, externalCalendarId: string): PlannerBlock | null => {
  const get = (key: string): string | undefined => {
    // Match KEY;params:value or KEY:value, case-insensitive
    const re = new RegExp(`^${key}(?:;[^:]*)?:(.*)`, 'mi');
    return raw.match(re)?.[1]?.trim() ?? undefined;
  };

  const uid = get('UID');
  const summary = get('SUMMARY') ?? '(No title)';
  const status = get('STATUS');

  // Skip cancelled
  if (status === 'CANCELLED') return null;

  const dtStartRaw = get('DTSTART');
  const dtEndRaw = get('DTEND') ?? get('DURATION');

  // Skip all-day events (DATE format, no time component)
  if (!dtStartRaw || /^\d{8}$/.test(dtStartRaw)) return null;

  const start = parseIcsDateTime(dtStartRaw);
  if (!start) return null;

  let end: Date | null = null;
  if (dtEndRaw) {
    if (dtEndRaw.startsWith('P')) {
      // DURATION value
      end = addDuration(start, dtEndRaw);
    } else {
      end = parseIcsDateTime(dtEndRaw);
    }
  }

  // Default 60 min if no end
  if (!end) {
    end = new Date(start.getTime() + 60 * 60000);
  }

  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (durationMinutes <= 0) return null;

  const date = toDateString(start);
  const startTime = toTimeString(start);
  const endTime = toTimeString(end);

  const description = get('DESCRIPTION')?.replace(/\\n/g, '\n').replace(/\\,/g, ',') ?? undefined;
  const location = get('LOCATION')?.replace(/\\,/g, ',') ?? undefined;

  // Deterministic ID
  const safeUid = uid ?? `${date}-${startTime}-${summary}`;
  const id = `${ICS_BLOCK_ID_PREFIX}${safeUid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}`;

  return {
    id,
    title: decodeIcsText(summary),
    description: description ? decodeIcsText(description) : undefined,
    durationMinutes,
    date,
    startTime,
    endTime,
    isScheduled: true,
    isBaseEvent: false,
    isHidden: false,
    sourceType: 'calendar_import',
    metadata: {
      source: {
        provider: 'apple_calendar',
        name: calendarName,
        externalCalendarId,
        externalId: uid,
        importedAt: Date.now(),
        link: 'imported_copy',
        lastSyncedAt: Date.now(),
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
    importSource: 'Apple Calendar',
    importRawLine: location,          // store location in importRawLine (re-used field)
    createdAt: start.getTime(),
    updatedAt: Date.now(),
    deletedAt: undefined,
  };
};

// ─── Date/time helpers ────────────────────────────────────────────────────────

/**
 * Parse iCalendar DTSTART/DTEND values.
 * Handles: 20240610T090000Z  (UTC)
 *          20240610T090000   (floating / local)
 *          TZID=...:20240610T090000
 */
const parseIcsDateTime = (raw: string): Date | null => {
  // Strip TZID param if present (value is after the colon)
  const value = raw.includes(':') ? raw.split(':').slice(1).join(':') : raw;

  if (!/^\d{8}T\d{6}/.test(value)) return null;

  const year   = parseInt(value.slice(0, 4));
  const month  = parseInt(value.slice(4, 6)) - 1;
  const day    = parseInt(value.slice(6, 8));
  const hour   = parseInt(value.slice(9, 11));
  const minute = parseInt(value.slice(11, 13));
  const second = parseInt(value.slice(13, 15));

  if (value.endsWith('Z')) {
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
  // Floating — treat as local time
  return new Date(year, month, day, hour, minute, second);
};

/** Apply an iCal DURATION string (e.g. PT1H30M) to a start date. */
const addDuration = (start: Date, dur: string): Date => {
  const m = dur.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
  if (!m) return start;
  const days    = parseInt(m[1] ?? '0');
  const hours   = parseInt(m[2] ?? '0');
  const minutes = parseInt(m[3] ?? '0');
  const seconds = parseInt(m[4] ?? '0');
  return new Date(start.getTime() + ((days * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000));
};

const toDateString = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const toTimeString = (d: Date): string =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const pad = (n: number) => String(n).padStart(2, '0');

const decodeIcsText = (s: string): string =>
  s.replace(/\\n/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
