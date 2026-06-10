import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

export interface AdminLog {
  id: string;
  adminUid: string;
  adminEmail: string;
  action: string;
  details: string;
  targetId?: string;
  timestamp: any;
}

export function useAdminAudit() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { db } = initializeFirebase();
    // Fetch last 100 logs
    const q = query(collection(db, 'admin_logs'), orderBy('timestamp', 'desc'), limit(100));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminLog));
      setLogs(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logAction = async (adminUid: string, adminEmail: string, action: string, details: string, targetId?: string) => {
    try {
      const { db } = initializeFirebase();
      await addDoc(collection(db, 'admin_logs'), {
        adminUid,
        adminEmail,
        action,
        details,
        targetId: targetId || null,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to write audit log:", error);
    }
  };

  return { logs, loading, logAction };
}
