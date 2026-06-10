import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  isActive: boolean;
  createdAt: any;
}

export function useAnnouncements(activeOnly = true) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { db } = initializeFirebase();
    // We order by createdAt descending
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement));
      if (activeOnly) {
        data = data.filter(a => a.isActive);
      }
      setAnnouncements(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeOnly]);

  const createAnnouncement = async (announcement: Omit<Announcement, 'id' | 'createdAt'>) => {
    const { db } = initializeFirebase();
    await addDoc(collection(db, 'announcements'), {
      ...announcement,
      createdAt: serverTimestamp()
    });
  };

  const toggleAnnouncement = async (id: string, isActive: boolean) => {
    const { db } = initializeFirebase();
    await updateDoc(doc(db, 'announcements', id), { isActive });
  };

  const deleteAnnouncement = async (id: string) => {
    const { db } = initializeFirebase();
    await deleteDoc(doc(db, 'announcements', id));
  };

  return { announcements, loading, createAnnouncement, toggleAnnouncement, deleteAnnouncement };
}
