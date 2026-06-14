/**
 * Per-source-calendar import preferences (reqs #7, #8).
 *
 * When a user imports a calendar they can pick a destination (week vs Ready to
 * schedule) and a category/tag, and name the source. Those choices are saved
 * keyed by the source calendar so the next import of the same calendar reuses
 * them automatically.
 *
 * The merge/apply logic is pure and unit-tested; persistence is a thin
 * localStorage wrapper so it works in the local-first app without a migration.
 */

import type {
  CalendarImportPreference,
  ImportTarget,
  PlannerBlock,
  PlannerSourceProvider,
} from '../types/models';

const STORAGE_KEY = 'planner.calendarImportPrefs';

export type ImportPreferenceMap = Record<string, CalendarImportPreference>;

/** Stable key for a source calendar. */
export const importPrefKey = (provider: PlannerSourceProvider, externalCalendarId: string): string =>
  `${provider}:${externalCalendarId}`;

export interface ImportPreferenceInput {
  provider: PlannerSourceProvider;
  externalCalendarId: string;
  calendarName: string;
  categoryId?: string;
  labelId?: string;
  target: ImportTarget;
}

/** Look up the saved preference for a source calendar, if any (pure). */
export const findImportPreference = (
  prefs: ImportPreferenceMap,
  provider: PlannerSourceProvider,
  externalCalendarId: string,
): CalendarImportPreference | undefined =>
  prefs[importPrefKey(provider, externalCalendarId)];

/** Return a new map with the given preference upserted (pure, immutable). */
export const upsertImportPreference = (
  prefs: ImportPreferenceMap,
  input: ImportPreferenceInput,
  now: number,
): ImportPreferenceMap => {
  const key = importPrefKey(input.provider, input.externalCalendarId);
  return {
    ...prefs,
    [key]: {
      key,
      provider: input.provider,
      externalCalendarId: input.externalCalendarId,
      calendarName: input.calendarName,
      categoryId: input.categoryId,
      labelId: input.labelId,
      target: input.target,
      updatedAt: now,
    },
  };
};

/**
 * Apply a saved preference to a freshly-parsed imported block (pure).
 * Sets the category, adds the tag/label, and re-targets the block between the
 * week grid and the inbox.
 */
export const applyImportPreferenceToBlock = (
  block: PlannerBlock,
  pref: CalendarImportPreference,
): PlannerBlock => {
  const existingLabels = block.metadata?.labelIds ?? [];
  const labelIds = pref.labelId && !existingLabels.includes(pref.labelId)
    ? [...existingLabels, pref.labelId]
    : existingLabels;

  const toInbox = pref.target === 'inbox';

  return {
    ...block,
    categoryId: pref.categoryId ?? block.categoryId,
    isScheduled: toInbox ? false : block.isScheduled,
    date: toInbox ? undefined : block.date,
    startTime: toInbox ? undefined : block.startTime,
    endTime: toInbox ? undefined : block.endTime,
    metadata: block.metadata
      ? { ...block.metadata, labelIds }
      : block.metadata,
  };
};

// ─── Persistence (thin localStorage wrapper) ───────────────────────────────────

export const loadImportPreferences = (): ImportPreferenceMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ImportPreferenceMap) : {};
  } catch {
    return {};
  }
};

export const saveImportPreferences = (prefs: ImportPreferenceMap): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Local-first: ignore storage failures, the import still works this session.
  }
};

/** Convenience: persist a single preference, returning the new map. */
export const rememberImportPreference = (input: ImportPreferenceInput, now = Date.now()): ImportPreferenceMap => {
  const next = upsertImportPreference(loadImportPreferences(), input, now);
  saveImportPreferences(next);
  return next;
};
