import type { SyncAction, SyncEntityType, SyncStatusText } from '../types/models';

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
  // Offline takes precedence over a pending queue: tell the user plainly that
  // their changes are saved and will sync once they reconnect.
  if (!state.isOnline) return 'Offline';
  if (state.pendingCount > 0) {
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

// A logged-in account is always a synced account. We no longer ask the user
// whether to import or stay device-only — being signed in means every change
// queues for the cloud, and existing on-device data is imported automatically
// once (see queueLocalImportForCurrentUser, run on sign-in).
export const shouldQueueForSync = (state: {
  isConfigured: boolean;
  isLoggedIn: boolean;
}): boolean => state.isConfigured && state.isLoggedIn;
