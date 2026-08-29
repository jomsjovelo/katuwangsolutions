import { usePinApprovalStore } from '@/store/use-pin-approval-store';
import { useTenant } from '@/app/lib/tenant-context';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestoreDocument } from '@/hooks/use-firestore-subscription';
import { doc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';

export function usePinApproval() {
  const { requestApproval } = usePinApprovalStore();
  const { currentTenant } = useTenant();
  const { user } = useUser();
  const db = initializeFirebase().db;
  const isCashier = useSecureCashierStore(state => state.isCashierAuthenticated);

  // Cashiers must never subscribe to users/{uid} (Firestore Rules deny access)
  const { data: profile } = useFirestoreDocument(user && !isCashier ? doc(db, 'users', user.uid) : null);

  const isOwner = !isCashier && (currentTenant?.ownerUid === user?.uid || profile?.role === 'owner');

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
