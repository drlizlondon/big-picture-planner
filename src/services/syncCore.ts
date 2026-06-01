import type { ImportDecision, SyncAction, SyncEntityType, SyncStatusText } from '../types/models';

export interface QueueLikeItem<TPayload> {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  payload?: TPayload;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  nextAttemptAt?: number;
  lastError?: string;
}

export const getSyncStatusLabel = (state: {
  isSyncing: boolean;
  isConfigured: boolean;
  isLoggedIn: boolean;
  isOnline: boolean;
  pendingCount: number;
  hasRetriedItem: boolean;
  hasSynced: boolean;
}): SyncStatusText => {
  if (state.isSyncing) return 'Syncing';
  if (!state.isConfigured || !state.isLoggedIn) return 'Saved on this device';
  if (!state.isOnline || state.pendingCount > 0) {
    return state.hasRetriedItem ? 'Sync failed, retrying' : 'Sync pending';
  }
  return state.hasSynced ? 'Synced' : 'Sync pending';
};

export const mergeQueuedChange = <TPayload>(
  existing: QueueLikeItem<TPayload> | undefined,
  next: Omit<QueueLikeItem<TPayload>, 'id' | 'createdAt' | 'attempts'>
): QueueLikeItem<TPayload> | Omit<QueueLikeItem<TPayload>, 'id'> => {
  if (!existing) {
    return {
      ...next,
      createdAt: next.updatedAt,
      attempts: 0,
    };
  }

  return {
    ...existing,
    action: next.action,
    payload: next.payload,
    updatedAt: next.updatedAt,
    attempts: 0,
    nextAttemptAt: undefined,
    lastError: undefined,
  };
};

export const getRetryDelayMs = (attempts: number): number => {
  return Math.min(30000, 2500 * Math.max(1, attempts));
};

export const getImportPromptState = (state: {
  hasLocalData: boolean;
  decision?: ImportDecision;
}): 'prompt' | 'quiet-later' | 'none' => {
  if (!state.hasLocalData) return 'none';
  if (!state.decision) return 'prompt';
  if (state.decision === 'later') return 'quiet-later';
  return 'none';
};

export const shouldQueueForSync = (state: {
  isConfigured: boolean;
  isLoggedIn: boolean;
  hasLocalData: boolean;
  decision?: ImportDecision;
}): boolean => {
  if (!state.isConfigured || !state.isLoggedIn) return false;
  if (state.decision === 'later') return false;
  if (state.decision === 'imported' || state.decision === 'device-only') return true;
  return !state.hasLocalData;
};
