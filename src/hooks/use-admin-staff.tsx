import { useState, useEffect } from 'react';
import { collection, doc, query, where, getDocs, writeBatch, serverTimestamp, addDoc, arrayUnion } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeFirebase } from '@/firebase';
import { processUniversalReferral } from '@/firebase/firestore/referral-utils';

export function useAdminStaff(enabled: boolean = true) {
  const [pendingStaff, setPendingStaff] = useState<any[]>([]);
  const [activeStaff, setActiveStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const { db } = initializeFirebase();
      const pendingQuery = query(collection(db, 'users'), where('approvalStatus', '==', 'pending_admin'));
      const activeQuery = query(collection(db, 'users'), where('approvalStatus', '==', 'approved'));
      
      const [pendingSnap, activeSnap] = await Promise.all([
        getDocs(pendingQuery),
        getDocs(activeQuery)
      ]);

      setPendingStaff(pendingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setActiveStaff(activeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setError(null);
    } catch (e) {
      const err = e as Error & { code?: string };
      console.error('Error fetching admin staff:', err);
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

  const approveStaff = async (staff: any) => {
    try {
      const { db } = initializeFirebase();
      const auth = getAuth();
      const adminUser = auth.currentUser;
      const userRef = doc(db, 'users', staff.id);
      const tenantRef = doc(db, 'tenants', staff.tenantId);
      
      const batch = writeBatch(db);
      
      // Update the user
      batch.update(userRef, {
        role: 'staff',
        approvalStatus: 'approved',
        updatedAt: serverTimestamp()
      });

      // Add to tenant staff list
      batch.update(tenantRef, {
        staffUids: arrayUnion(staff.id),
        updatedAt: serverTimestamp()
      });

      // Process universal referral payout if they were referred
      if (staff.referredBy && !staff.referralPaid) {
        await processUniversalReferral(db, batch, staff.referredBy, staff.id, 'staff', 10);
        
        batch.update(userRef, {
          referralPaid: true,
          lastReferralPaidAt: serverTimestamp()
        });
      }

      if (adminUser) {
        await addDoc(collection(db, 'admin_logs'), {
          adminUid: adminUser.uid,
          adminEmail: adminUser.email || 'Unknown',
          action: 'APPROVE_STAFF',
          details: `Approved staff ${staff.fullName} for tenant ${staff.tenantId}`,
          targetId: staff.id,
          timestamp: serverTimestamp()
        });
      }

      await batch.commit();
      setPendingStaff(prev => prev.filter(s => s.id !== staff.id));
      setActiveStaff(prev => [{ ...staff, approvalStatus: 'approved', role: 'staff' }, ...prev]);
    } catch (err) {
      console.error('Failed to approve staff:', err);
      throw err;
    }
  };

  const rejectStaff = async (staffId: string) => {
    try {
      const { db } = initializeFirebase();
      const auth = getAuth();
      const adminUser = auth.currentUser;
      const userRef = doc(db, 'users', staffId);
      
      const batch = writeBatch(db);
      batch.delete(userRef);

      if (adminUser) {
        await addDoc(collection(db, 'admin_logs'), {
          adminUid: adminUser.uid,
          adminEmail: adminUser.email || 'Unknown',
          action: 'REJECT_STAFF',
          details: `Rejected staff ID ${staffId}`,
          targetId: staffId,
          timestamp: serverTimestamp()
        });
      }

      await batch.commit();
      setPendingStaff(prev => prev.filter(s => s.id !== staffId));
    } catch (err) {
      console.error('Failed to reject staff:', err);
      throw err;
    }
  };

  return { pendingStaff, activeStaff, loading, error, approveStaff, rejectStaff, refetch: fetchStaff };
}
