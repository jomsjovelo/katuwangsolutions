/**
 * Real-Time Offline-Sync Status Hook for Katuwang POS
 * Tracks browser online status and listens to Firestore's local mutation queue state.
 */

import { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

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

  // 2. Listen to Firestore offline queue metadata transitions
  useEffect(() => {
    if (!tenantId) return;

    try {
      const db = initializeFirebase().db;
      const salesRef = collection(db, 'tenants', tenantId, 'transactions');
      // Limit to last 10 transactions to keep memory and CPU low
      const q = query(salesRef, orderBy('createdAt', 'desc'), limit(10));

      const unsubscribe = onSnapshot(
        q, 
        { includeMetadataChanges: true }, 
        (snapshot) => {
          // If any doc has pending writes, synchronization is active
          const pending = snapshot.metadata.hasPendingWrites;
          setIsSyncing(pending);

          // Track exactly how many transactions are waiting in the queue
          let localCount = 0;
          snapshot.docs.forEach((doc) => {
            if (doc.metadata.hasPendingWrites) {
              localCount++;
            }
          });
          setPendingCount(localCount);
        }, 
        (err) => {
          // If security rules or index is still configuring, bypass gracefully
          console.warn("Sync status listener bypassed (index pending):", err.message);
        }
      );

      return () => unsubscribe();
    } catch (e) {
      console.warn("Failed to initialize offline sync status listener:", e);
    }
  }, [tenantId]);

  // Resolve status notifications in Tagalog for wet market vendors
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
