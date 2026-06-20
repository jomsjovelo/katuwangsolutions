import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, writeBatch, serverTimestamp, addDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';

export function useAdminAllStaff(enabled: boolean = true) {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const { db } = initializeFirebase();
      
      const q = query(
        collection(db, 'users'), 
        where('role', '==', 'staff')
      );

      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStaff(data);
      setError(null);
    } catch (e) {
      const err = e as Error & { code?: string };
      console.error('Error fetching all staff:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (enabled) {
      fetchStaff();
    }
  }, [enabled]);

  const suspendStaff = async (staffId: string) => {
    try {
      const { db } = initializeFirebase();
      const auth = getAuth();
      const adminUser = auth.currentUser;
      const { doc } = await import('firebase/firestore');
      const userRef = doc(db, 'users', staffId);
      
      const batch = writeBatch(db);
      batch.update(userRef, {
        subscriptionStatus: 'suspended',
        updatedAt: serverTimestamp()
      });

      if (adminUser) {
        await addDoc(collection(db, 'admin_logs'), {
          adminUid: adminUser.uid,
          adminEmail: adminUser.email || 'Unknown',
          action: 'SUSPEND_STAFF',
          details: `Suspended staff ID ${staffId}`,
          targetId: staffId,
          timestamp: serverTimestamp()
        });
      }

      await batch.commit();
      setStaff(prev => prev.map(s => s.id === staffId ? { ...s, subscriptionStatus: 'suspended' } : s));
    } catch (err) {
      console.error('Failed to suspend staff:', err);
      throw err;
    }
  };
  
  const reactivateStaff = async (staffId: string) => {
    try {
      const { db } = initializeFirebase();
      const auth = getAuth();
      const adminUser = auth.currentUser;
      const { doc } = await import('firebase/firestore');
      const userRef = doc(db, 'users', staffId);
      
      const batch = writeBatch(db);
      batch.update(userRef, {
        subscriptionStatus: 'active',
        updatedAt: serverTimestamp()
      });

      if (adminUser) {
        await addDoc(collection(db, 'admin_logs'), {
          adminUid: adminUser.uid,
          adminEmail: adminUser.email || 'Unknown',
          action: 'REACTIVATE_STAFF',
          details: `Reactivated staff ID ${staffId}`,
          targetId: staffId,
          timestamp: serverTimestamp()
        });
      }

      await batch.commit();
      setStaff(prev => prev.map(s => s.id === staffId ? { ...s, subscriptionStatus: 'active' } : s));
    } catch (err) {
      console.error('Failed to reactivate staff:', err);
      throw err;
    }
  };

  const deleteStaff = async (staffId: string, tenantId: string) => {
    try {
      const { db } = initializeFirebase();
      const auth = getAuth();
      const adminUser = auth.currentUser;
      const { doc, arrayRemove } = await import('firebase/firestore');
      const userRef = doc(db, 'users', staffId);
      const tenantRef = doc(db, 'tenants', tenantId);
      
      const batch = writeBatch(db);
      
      // Delete user doc
      batch.delete(userRef);
      
      // Remove from tenant
      batch.update(tenantRef, {
        staffUids: arrayRemove(staffId),
        updatedAt: serverTimestamp()
      });

      if (adminUser) {
        await addDoc(collection(db, 'admin_logs'), {
          adminUid: adminUser.uid,
          adminEmail: adminUser.email || 'Unknown',
          action: 'DELETE_STAFF',
          details: `Permanently deleted staff ID ${staffId} from tenant ${tenantId}`,
          targetId: staffId,
          timestamp: serverTimestamp()
        });
      }

      await batch.commit();
      setStaff(prev => prev.filter(s => s.id !== staffId));
    } catch (err) {
      console.error('Failed to delete staff:', err);
      throw err;
    }
  };

  return { 
    staff, 
    loading, 
    error, 
    fetchStaff, 
    suspendStaff,
    reactivateStaff,
    deleteStaff 
  };
}
