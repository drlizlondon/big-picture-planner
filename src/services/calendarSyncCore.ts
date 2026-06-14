/**
 * External-calendar (Google / Apple) sync logic — pure functions only.
 *
 * This is deliberately separate from syncCore.ts, which handles the *device → cloud*
 * (Supabase) sync. This module is about how a Big Planner block relates to an event
 * in an external calendar: whether it is local-only, an imported copy, a live link,
 * or an export — and whether local/external edits are in sync, ahead, or in conflict.
 *
 * Keeping it pure (no Dexie, no fetch) means the conflict and status rules can be
 * unit-tested exhaustively without a browser or network.
 */

import type {
  CalendarLinkType,
  CalendarSourceMetadata,
  CalendarSyncStatus,
  CalendarWriteBackPreference,
  CalendarWriteScope,
  PlannerBlock,
} from '../types/models';

// ─── Link classification (req #4) ──────────────────────────────────────────────

/** Providers that support a genuine two-way link (edits can be written back). */
const TWO_WAY_PROVIDERS = new Set(['google_calendar']);

/** Providers that are one-way snapshots into Big Planner. */
const ONE_WAY_IMPORT_PROVIDERS = new Set(['apple_calendar', 'import', 'outlook']);

/**
 * Classify how a block relates to its external calendar. Falls back to the
 * provider when an explicit link type hasn't been stored yet, so older blocks
 * imported before this field existed still classify correctly.
 */
export const getCalendarLinkType = (source?: CalendarSourceMetadata): CalendarLinkType => {
  if (!source) return 'local_only';
  if (source.link) return source.link;

  const provider = source.provider;
  if (TWO_WAY_PROVIDERS.has(provider)) return 'linked';
  if (ONE_WAY_IMPORT_PROVIDERS.has(provider)) return 'imported_copy';
  return 'local_only';
};

export const isExternallyLinked = (source?: CalendarSourceMetadata): boolean =>
  getCalendarLinkType(source) === 'linked' || getCalendarLinkType(source) === 'exported';

/** True when edits to this block are *capable* of being written to an external calendar. */
export const supportsWriteBack = (source?: CalendarSourceMetadata): boolean => {
  if (!source) return false;
  return TWO_WAY_PROVIDERS.has(source.provider) && isExternallyLinked(source);
};

// ─── Sync status (req #6, #9) ──────────────────────────────────────────────────

export interface SyncTimes {
  /** When the user last edited the block locally. */
  localEditedAt?: number;
  /** The external event's last-modified time at the most recent sync. */
  externalUpdatedAt?: number;
  /** When Big Planner last reconciled the two. */
  lastSyncedAt?: number;
}

/**
 * Conflict-safe reconciliation rule (req #6).
 *
 * Returns what *changed* relative to the last sync — never decides to overwrite.
 * Callers must treat 'conflict' as "ask the user / do not auto-write".
 *
 *  - in_sync       neither side changed since the last sync
 *  - local_ahead   only Big Planner changed   → safe to push
 *  - external_ahead only the external calendar changed → safe to pull
 *  - conflict      BOTH changed since the last sync → needs a decision
 */
export type SyncResolution = 'in_sync' | 'local_ahead' | 'external_ahead' | 'conflict';

export const resolveCalendarSync = (times: SyncTimes): SyncResolution => {
  const since = times.lastSyncedAt ?? 0;
  const localChanged = (times.localEditedAt ?? 0) > since;
  const externalChanged = (times.externalUpdatedAt ?? 0) > since;

  if (localChanged && externalChanged) return 'conflict';
  if (localChanged) return 'local_ahead';
  if (externalChanged) return 'external_ahead';
  return 'in_sync';
};

/** Derive the user-facing sync status for a block (req #9). */
export const deriveCalendarSyncStatus = (block: Pick<PlannerBlock, 'metadata'>): CalendarSyncStatus => {
  const source = block.metadata?.source;
  const link = getCalendarLinkType(source);

  // Anything not connected to an external calendar is simply local.
  if (link === 'local_only') return 'local_only';

  // One-way imported copies can never be "in conflict" — they are read-only
  // snapshots. If the user edited the local copy we still show that honestly.
  if (link === 'imported_copy') {
    const since = source?.lastSyncedAt ?? source?.importedAt ?? 0;
    return (source?.localEditedAt ?? 0) > since ? 'changed_locally' : 'synced';
  }

  // Linked / exported: full reconciliation.
  switch (resolveCalendarSync({
    localEditedAt: source?.localEditedAt,
    externalUpdatedAt: source?.externalUpdatedAt,
    lastSyncedAt: source?.lastSyncedAt,
  })) {
    case 'conflict': return 'conflict';
    case 'local_ahead': return 'changed_locally';
    case 'external_ahead': return 'changed_externally';
    default: return 'synced';
  }
};

const SYNC_STATUS_LABELS: Record<CalendarSyncStatus, string> = {
  synced: 'Synced',
  local_only: 'Local only',
  changed_locally: 'Changed in Big Planner',
  changed_externally: 'Changed externally',
  conflict: 'Conflict',
};

/** Human-readable label for a sync status (req #9). */
export const getCalendarSyncStatusLabel = (status: CalendarSyncStatus): string =>
  SYNC_STATUS_LABELS[status];

// ─── Write-scope decision (req #5) ─────────────────────────────────────────────

export interface WriteScopeDecision {
  /** Where the edit should be written now. */
  scope: CalendarWriteScope;
  /** Whether the caller must ask the user before doing anything external. */
  requiresChoice: boolean;
  /**
   * Whether pushing externally is currently unsafe because the external copy
   * also changed (conflict). The UI must surface a conflict resolution instead
   * of silently overwriting (req #6).
   */
  blockedByConflict: boolean;
}

/**
 * Decide how an edit to a block should be written, honouring the user's
 * write-back preference and never silently overwriting an external calendar
 * (reqs #5 and #6).
 *
 * Local-only / imported-copy blocks are always written locally with no choice.
 * For linked blocks:
 *   - 'local_only' preference → write locally, no external push.
 *   - 'always' preference     → push externally *unless* there is a conflict.
 *   - 'ask' preference        → write locally now and flag that a choice is needed.
 */
export const decideWriteScope = (
  block: Pick<PlannerBlock, 'metadata'>,
  preference: CalendarWriteBackPreference,
): WriteScopeDecision => {
  const source = block.metadata?.source;

  if (!supportsWriteBack(source)) {
    return { scope: 'local_only', requiresChoice: false, blockedByConflict: false };
  }

  const status = deriveCalendarSyncStatus(block);
  const blockedByConflict = status === 'conflict' || status === 'changed_externally';

  if (preference === 'local_only') {
    return { scope: 'local_only', requiresChoice: false, blockedByConflict };
  }

  if (preference === 'always') {
    // Never overwrite an external change automatically — fall back to local + choice.
    if (blockedByConflict) {
      return { scope: 'local_only', requiresChoice: true, blockedByConflict: true };
    }
    return { scope: 'external', requiresChoice: false, blockedByConflict: false };
  }

  // 'ask' — keep the edit local and let the UI offer "also update <calendar>".
  return { scope: 'local_only', requiresChoice: true, blockedByConflict };
};

// ─── Metadata transitions (helpers used by services) ───────────────────────────

/** Stamp source metadata after a successful pull from the external calendar. */
export const markSourceSynced = (
  source: CalendarSourceMetadata,
  externalUpdatedAt: number,
  now: number,
): CalendarSourceMetadata => ({
  ...source,
  lastSyncedAt: now,
  externalUpdatedAt,
  localEditedAt: undefined,
  syncStatus: 'synced',
});

/** Stamp source metadata after a local edit that has NOT been pushed externally. */
export const markSourceChangedLocally = (
  source: CalendarSourceMetadata,
  now: number,
): CalendarSourceMetadata => ({
  ...source,
  localEditedAt: now,
  syncStatus: 'changed_locally',
});

/** Stamp source metadata after a local edit was successfully written back externally. */
export const markSourcePushed = (
  source: CalendarSourceMetadata,
  now: number,
): CalendarSourceMetadata => ({
  ...source,
  lastSyncedAt: now,
  externalUpdatedAt: now,
  localEditedAt: undefined,
  syncStatus: 'synced',
});
