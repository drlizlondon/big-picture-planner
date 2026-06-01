import { useEffect, useState } from 'react';
import { getSyncSnapshot, subscribeToSyncChanges, syncPendingChanges, type SyncSnapshot } from '../services/syncService';

const fallbackSnapshot: SyncSnapshot = {
  label: 'Saved on this device',
  pendingCount: 0,
  isConfigured: false,
  isOnline: true,
  isLoggedIn: false,
  needsImport: false,
  canImportLocalData: false,
  isSyncing: false,
};

export const useSyncStatus = (): SyncSnapshot => {
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(fallbackSnapshot);

  useEffect(() => {
    let isMounted = true;

    const refresh = async () => {
      const nextSnapshot = await getSyncSnapshot();
      if (isMounted) setSnapshot(nextSnapshot);
    };

    void refresh();
    void syncPendingChanges();

    const unsubscribe = subscribeToSyncChanges(() => {
      void refresh();
    });

    const retryTimer = window.setInterval(() => {
      void syncPendingChanges();
      void refresh();
    }, 10000);

    return () => {
      isMounted = false;
      unsubscribe();
      window.clearInterval(retryTimer);
    };
  }, []);

  return snapshot;
};
