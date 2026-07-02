import { db, createId } from '../db/db';
import type { Category, ImportDecision, PlannerBlock, PlannerTemplate, SyncAction, SyncEntityType, SyncStatusText } from '../types/models';
import { getCurrentSession, getSupabaseClient } from './supabaseClient';
import { getRetryDelayMs, getSyncStatusLabel, mergeQueuedChange, shouldQueueForSync } from './syncCore';
import { syncGoogleCalendarEvents } from './googleCalendarService';

const CLOUD_TABLES: Record<SyncEntityType, string> = {
  blocks: 'planner_blocks',
  templates: 'planner_templates',
  categories: 'planner_categories',
};

const IMPORT_META_PREFIX = 'cloudImportDecision:';
const LAST_PULLED_PREFIX = 'cloudLastPulledAt:';
const SYNC_EVENT = 'planner-sync-change';
const PERIODIC_SYNC_MS = 5 * 60 * 1000;

type SyncPayload = PlannerBlock | PlannerTemplate | Category;

export interface SyncSnapshot {
  label: SyncStatusText;
  pendingCount: number;
  isConfigured: boolean;
  isOnline: boolean;
  isLoggedIn: boolean;
  userEmail?: string;
  needsImport: boolean;
  canImportLocalData: boolean;
  importDecision?: ImportDecision;
  isSyncing: boolean;
}

let isSyncing = false;
let lastSyncedAt = 0;

const emitSyncChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SYNC_EVENT));
  }
};

const isOnline = () => typeof navigator === 'undefined' ? true : navigator.onLine;

const importMetaKey = (userId: string) => `${IMPORT_META_PREFIX}${userId}`;

export const subscribeToSyncChanges = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => {
    callback();
    void pullFromCloud().then(() => syncPendingChanges());
  };

  window.addEventListener(SYNC_EVENT, callback);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', callback);

  const supabase = getSupabaseClient();

  // A logged-in account is always synced: pull the cloud, import any existing
  // on-device data once (self-guarded), then flush the queue.
  const pullImportFlush = () => {
    void pullFromCloud()
      .then(() => queueLocalImportForCurrentUser())
      .then(() => syncPendingChanges());
    void syncGoogleCalendarEvents();
  };

  const subscription = supabase?.auth.onAuthStateChange((event) => {
    callback();
    // INITIAL_SESSION fires when a returning user's session is silently restored
    // on load — treat it like a fresh sign-in so their data hydrates immediately
    // instead of waiting for the periodic pull.
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      pullImportFlush();
    } else {
      void syncPendingChanges();
    }
  });

  // Belt-and-braces: if a session already exists at subscribe time (e.g. the
  // auth event fired before this listener attached), hydrate right away.
  void getCurrentSession().then((session) => {
    if (session) pullImportFlush();
  });

  const periodicInterval = setInterval(() => {
    if (isOnline()) {
      void pullFromCloud().then(() => syncPendingChanges());
      void syncGoogleCalendarEvents();
    }
  }, PERIODIC_SYNC_MS);

  return () => {
    window.removeEventListener(SYNC_EVENT, callback);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', callback);
    subscription?.data.subscription.unsubscribe();
    clearInterval(periodicInterval);
  };
};

export const enqueueSyncChange = async (
  entityType: SyncEntityType,
  entityId: string,
  action: SyncAction,
  payload?: SyncPayload,
  options: { force?: boolean } = {}
): Promise<void> => {
  if (!options.force && !await canQueueForCurrentUser()) {
    emitSyncChange();
    return;
  }

  const now = Date.now();
  const existing = await db.syncQueue
    .filter(item => item.entityType === entityType && item.entityId === entityId)
    .first();
  const nextChange = mergeQueuedChange(existing, {
    entityType,
    entityId,
    action,
    payload,
    updatedAt: now,
  });

  if (existing) {
    await db.syncQueue.update(existing.id, {
      action: nextChange.action,
      payload: nextChange.payload,
      updatedAt: nextChange.updatedAt,
      attempts: nextChange.attempts,
      nextAttemptAt: nextChange.nextAttemptAt,
      lastError: nextChange.lastError,
    });
  } else {
    await db.syncQueue.add({
      ...nextChange,
      id: createId(),
    });
  }

  emitSyncChange();
  void syncPendingChanges();
};

export const getSyncSnapshot = async (): Promise<SyncSnapshot> => {
  const supabase = getSupabaseClient();
  const session = await getCurrentSession();
  const pendingItems = await db.syncQueue.toArray();
  const retrying = pendingItems.some(item => item.attempts > 0);
  const importDecision = session ? await getImportDecision(session.user.id) : undefined;
  const canImportLocalData = session ? await hasLocalData() : false;
  // Logged-in is always synced: local data is imported automatically on sign-in,
  // so we never prompt the user to choose import vs device-only.
  const needsImport = false;
  const online = isOnline();

  const label = getSyncStatusLabel({
    isSyncing,
    isConfigured: !!supabase,
    isLoggedIn: !!session,
    isOnline: online,
    pendingCount: pendingItems.length,
    hasRetriedItem: retrying,
    hasSynced: lastSyncedAt > 0,
  });

  return {
    label,
    pendingCount: pendingItems.length,
    isConfigured: !!supabase,
    isOnline: online,
    isLoggedIn: !!session,
    userEmail: session?.user.email,
    needsImport,
    canImportLocalData,
    importDecision,
    isSyncing,
  };
};

export const syncPendingChanges = async (): Promise<void> => {
  if (isSyncing || !isOnline()) return;

  const supabase = getSupabaseClient();
  const session = await getCurrentSession();
  if (!supabase || !session) {
    emitSyncChange();
    return;
  }

  if (!await canQueueForCurrentUser()) {
    emitSyncChange();
    return;
  }

  const now = Date.now();
  const queue = await db.syncQueue
    .filter(item => !item.nextAttemptAt || item.nextAttemptAt <= now)
    .sortBy('createdAt');

  if (!queue.length) {
    lastSyncedAt = Date.now();
    emitSyncChange();
    return;
  }

  // Conflict policy for now: last local write wins. The outbox coalesces each
  // entity to its newest queued payload, then Supabase upsert stores that latest
  // payload by (user_id, id). We intentionally do not build merge UI until
  // calendar overlays introduce real cross-source conflict cases.
  isSyncing = true;
  emitSyncChange();

  try {
    for (const item of queue) {
      const tableName = CLOUD_TABLES[item.entityType];
      const payloadUpdatedAt = item.payload?.updatedAt ? new Date(item.payload.updatedAt).toISOString() : new Date(item.updatedAt).toISOString();

      if (item.action === 'delete') {
        const { error } = await supabase
          .from(tableName)
          .upsert({
            id: item.entityId,
            user_id: session.user.id,
            payload: item.payload || null,
            deleted_at: new Date(item.updatedAt).toISOString(),
            updated_at: payloadUpdatedAt,
          }, { onConflict: 'user_id,id' });
        if (error) throw error;
      } else if (item.payload) {
        const { error } = await supabase
          .from(tableName)
          .upsert({
            id: item.entityId,
            user_id: session.user.id,
            payload: item.payload,
            deleted_at: 'deletedAt' in item.payload && item.payload.deletedAt ? new Date(item.payload.deletedAt).toISOString() : null,
            updated_at: payloadUpdatedAt,
          }, { onConflict: 'user_id,id' });
        if (error) throw error;
      }

      await db.syncQueue.delete(item.id);
    }

    lastSyncedAt = Date.now();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync retry scheduled';
    await Promise.all(queue.map(item => db.syncQueue.update(item.id, {
      attempts: item.attempts + 1,
      lastError: message,
      nextAttemptAt: Date.now() + getRetryDelayMs(item.attempts + 1),
      updatedAt: Date.now(),
    })));
  } finally {
    isSyncing = false;
    emitSyncChange();
  }
};

export const pullFromCloud = async (): Promise<void> => {
  const supabase = getSupabaseClient();
  const session = await getCurrentSession();
  if (!supabase || !session || !isOnline()) return;

  const userId = session.user.id;
  const cursorKey = `${LAST_PULLED_PREFIX}${userId}`;
  const cursorMeta = await db.syncMeta.get(cursorKey);
  const cursor = cursorMeta?.value;

  // Capture fetch start before querying so next pull re-checks anything
  // written during this pull window.
  const fetchStartedAt = new Date().toISOString();

  type CloudRow = { id: string; payload: unknown; updated_at: string; deleted_at: string | null };

  const fetchRows = async (table: string): Promise<CloudRow[]> => {
    let query = supabase
      .from(table)
      .select('id, payload, updated_at, deleted_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true });

    if (cursor) {
      query = (query as typeof query).gt('updated_at', cursor);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as CloudRow[];
  };

  try {
    const [blockRows, templateRows, categoryRows] = await Promise.all([
      fetchRows('planner_blocks'),
      fetchRows('planner_templates'),
      fetchRows('planner_categories'),
    ]);

    for (const row of blockRows) {
      if (!row.payload || typeof row.payload !== 'object') continue;
      const cloud = row.payload as PlannerBlock;
      const cloudUpdatedAt = new Date(row.updated_at).getTime();
      const local = await db.blocks.get(row.id);

      if (!local || cloudUpdatedAt > local.updatedAt) {
        if (row.deleted_at) {
          await db.blocks.put({ ...cloud, id: row.id, deletedAt: cloudUpdatedAt, updatedAt: cloudUpdatedAt });
        } else {
          await db.blocks.put({ ...cloud, id: row.id });
        }
      }
    }

    for (const row of templateRows) {
      if (!row.payload || typeof row.payload !== 'object') continue;
      const cloud = row.payload as PlannerTemplate;
      const cloudUpdatedAt = new Date(row.updated_at).getTime();
      const local = await db.templates.get(row.id);

      if (!local || cloudUpdatedAt > local.updatedAt) {
        if (row.deleted_at) {
          await db.templates.put({ ...cloud, id: row.id, isArchived: true, updatedAt: cloudUpdatedAt });
        } else {
          await db.templates.put({ ...cloud, id: row.id });
        }
      }
    }

    for (const row of categoryRows) {
      if (!row.payload || typeof row.payload !== 'object') continue;
      const cloud = row.payload as Category;
      const cloudUpdatedAt = new Date(row.updated_at).getTime();
      const local = await db.categories.get(row.id);

      // Missing local.updatedAt (older local rows) is treated as 0 so the cloud
      // copy wins on a device that has never synced this category.
      if (!local || cloudUpdatedAt > (local.updatedAt ?? 0)) {
        if (row.deleted_at) {
          await db.categories.put({ ...cloud, id: row.id, isArchived: true, updatedAt: cloudUpdatedAt });
        } else {
          await db.categories.put({ ...cloud, id: row.id, updatedAt: cloudUpdatedAt });
        }
      }
    }

    await db.syncMeta.put({ key: cursorKey, value: fetchStartedAt, updatedAt: Date.now() });
    emitSyncChange();
  } catch {
    // Pull failures are silent; the next periodic interval will retry.
  }
};

export const queueLocalImportForCurrentUser = async (): Promise<void> => {
  const session = await getCurrentSession();
  if (!session) return;

  const alreadyImported = await db.syncMeta.get(importMetaKey(session.user.id));
  if (alreadyImported) return;

  const [blocks, templates] = await Promise.all([
    db.blocks.toArray(),
    db.templates.toArray(),
  ]);

  for (const block of blocks) {
    await enqueueSyncChange('blocks', block.id, block.deletedAt ? 'delete' : 'upsert', block, { force: true });
  }

  for (const template of templates) {
    await enqueueSyncChange('templates', template.id, template.isArchived ? 'delete' : 'upsert', template, { force: true });
  }

  await db.syncMeta.put({
    key: importMetaKey(session.user.id),
    value: 'imported',
    updatedAt: Date.now(),
  });

  emitSyncChange();
  void syncPendingChanges();
};

export const markImportDeviceOnlyForCurrentUser = async (): Promise<void> => {
  const session = await getCurrentSession();
  if (!session) return;

  await db.syncMeta.put({
    key: importMetaKey(session.user.id),
    value: 'device-only',
    updatedAt: Date.now(),
  });
  emitSyncChange();
};

export const markImportLaterForCurrentUser = async (): Promise<void> => {
  const session = await getCurrentSession();
  if (!session) return;

  await db.syncMeta.put({
    key: importMetaKey(session.user.id),
    value: 'later',
    updatedAt: Date.now(),
  });
  emitSyncChange();
};

const getImportDecision = async (userId: string): Promise<ImportDecision | undefined> => {
  const meta = await db.syncMeta.get(importMetaKey(userId));
  if (meta?.value === 'imported' || meta?.value === 'device-only' || meta?.value === 'later') {
    return meta.value;
  }
  return undefined;
};

const hasLocalData = async (): Promise<boolean> => {
  const [blockCount, templateCount] = await Promise.all([
    db.blocks.count(),
    db.templates.count(),
  ]);

  return blockCount + templateCount > 0;
};

const canQueueForCurrentUser = async (): Promise<boolean> => {
  const supabase = getSupabaseClient();
  const session = await getCurrentSession();

  return shouldQueueForSync({
    isConfigured: !!supabase,
    isLoggedIn: !!session,
  });
};

export const signOut = async (): Promise<void> => {
  const supabase = getSupabaseClient();
  await supabase?.auth.signOut();
  emitSyncChange();
};
