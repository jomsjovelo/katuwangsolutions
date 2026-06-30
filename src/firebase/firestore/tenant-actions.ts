import { doc, updateDoc } from 'firebase/firestore';
import { initializeFirebase } from '../index';
import { logAuditEvent } from './audit-actions';

export async function updateManagerPin(tenantId: string, managerPin: string, userId: string, userEmail: string) {
  const { db } = initializeFirebase();
  const tenantRef = doc(db, 'tenants', tenantId);

  await updateDoc(tenantRef, {
    managerPin
  });

  // Log the audit event
  await logAuditEvent(tenantId, userId, userEmail, {
    type: 'module_changed',
    description: `Store Owner updated the Manager Override PIN.`,
    meta: {
      actionType: 'update_pin'
    }
  });
}
