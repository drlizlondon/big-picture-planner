import { db, createId } from '../db/db';
import type { ImportDecision, PlannerBlock, PlannerTemplate, SyncAction, SyncEntityType, SyncStatusText } from '../types/models';
import { getCurrentSession, getSupabaseClient } from './supabaseClient';
import { getImportPromptState, getRetryDelayMs, getSyncStatusLabel, mergeQueuedChange, shouldQueueForSync } from './syncCore';

const CLOUD_TABLES: Record<SyncEntityType, string> = {
  blocks: 'planner_blocks',
  templates: 'planner_templates',
};

const IMPORT_META_PREFIX = 'cloudImportDecision:';
const SYNC_EVENT = 'planner-sync-change';

type SyncPayload = PlannerBlock | PlannerTemplate;

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
    void syncPendingChanges();
  };

  window.addEventListener(SYNC_EVENT, callback);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', callback);

  const supabase = getSupabaseClient();
  const subscription = supabase?.auth.onAuthStateChange(() => {
    callback();
    void syncPendingChanges();
  });

  return () => {
    window.removeEventListener(SYNC_EVENT, callback);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', callback);
    subscription?.data.subscription.unsubscribe();
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
  const importPromptState = getImportPromptState({ hasLocalData: canImportLocalData, decision: importDecision });
  const needsImport = importPromptState === 'prompt';
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
  const decision = session ? await getImportDecision(session.user.id) : undefined;
  const localData = session ? await hasLocalData() : false;

  return shouldQueueForSync({
    isConfigured: !!supabase,
    isLoggedIn: !!session,
    hasLocalData: localData,
    decision,
  });
};

export const signOut = async (): Promise<void> => {
  const supabase = getSupabaseClient();
  await supabase?.auth.signOut();
  emitSyncChange();
};
