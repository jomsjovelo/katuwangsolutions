/**
 * Real-Time Offline-Sync Status Hook for Katuwang POS
 * Tracks browser online status and listens to Firestore's local mutation queue state.
 */

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  syncMessage: string;
}

export function useSyncStatus(tenantId?: string): SyncStatus {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const isCashier = useSecureCashierStore(state => state.isCashierAuthenticated);

  // 1. Listen to browser standard network interface status
  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 2. Listen to Firestore offline queue metadata transitions for Owners only
  useEffect(() => {
    // Secure Cashiers do not use or listen to Firestore offline transaction queues
    if (!tenantId || isCashier) return;

    try {
      const db = initializeFirebase().db;
      const salesRef = collection(db, 'tenants', tenantId, 'transactions');
      const q = query(salesRef, orderBy('createdAt', 'desc'), limit(10));

      const unsubscribe = onSnapshot(
        q, 
        { includeMetadataChanges: true }, 
        (snapshot) => {
          const pending = snapshot.metadata.hasPendingWrites;
          setIsSyncing(pending);

          let localCount = 0;
          snapshot.docs.forEach((doc) => {
            if (doc.metadata.hasPendingWrites) {
              localCount++;
            }
          });
          setPendingCount(localCount);
        }, 
        (err) => {
          console.warn("Sync status listener bypassed:", err.message);
        }
      );

      return () => unsubscribe();
    } catch (e) {
      console.warn("Failed to initialize offline sync status listener:", e);
    }
  }, [tenantId, isCashier]);

  if (isCashier) {
    return {
      isOnline,
      isSyncing: false,
      pendingCount: 0,
      syncMessage: isOnline ? "Live Server Connected" : "Walang Internet: Hindi maaring mag-checkout"
    };
  }

  // Resolve status notifications in Tagalog for Owners
  let syncMessage = "Lahat ng benta ay naka-sync!";
  if (isSyncing) {
    syncMessage = `Isinasabay ang ${pendingCount > 0 ? pendingCount : 'iyong'} benta...`;
  } else if (!isOnline) {
    syncMessage = "Naka-save offline ang bagong benta.";
  }

  return {
    isOnline,
    isSyncing,
    pendingCount,
    syncMessage
  };
}
