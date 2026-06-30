import { usePinApprovalStore } from '@/store/use-pin-approval-store';
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestoreDocument } from '@/hooks/use-firestore-subscription';
import { doc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

export function usePinApproval() {
  const { requestApproval } = usePinApprovalStore();
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const { db } = initializeFirebase();
  const { data: profile } = useFirestoreDocument(user ? doc(db, 'users', user.uid) : null);

  const isOwner = currentTenant?.ownerUid === user?.uid || profile?.role === 'owner';

  const requireApproval = async (actionDescription: string): Promise<boolean> => {
    // Owners bypass the PIN check automatically
    if (isOwner) {
      return true;
    }
    
    // Staff must enter the PIN
    return await requestApproval(actionDescription);
  };

  return {
    requireApproval,
    isOwner
  };
}
