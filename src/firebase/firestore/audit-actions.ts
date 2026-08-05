import { collection, addDoc, serverTimestamp, getFirestore } from 'firebase/firestore';
import { initializeFirebase } from '../index';

export type AuditEventType = 
  | 'delete_transaction' 
  | 'edit_transaction' 
  | 'edit_sale'
  | 'add_staff' 
  | 'remove_staff' 
  | 'module_changed'
  | 'void_sale'
  | 'void_purchase'
  | 'delete_record'
  | 'void_transaction'
  | 'apply_discount'
  | 'price_override'
  | 'payout_expense'
  | 'status_change';

export interface AuditEventPayload {
  type: AuditEventType;
  description: string;
  meta?: Record<string, any>;
}

export async function logAuditEvent(
  tenantId: string, 
  userId: string, 
  userName: string,
  event: AuditEventPayload
) {
  const db = initializeFirebase().db;
  try {
    const auditRef = collection(db, 'tenants', tenantId, 'audit_log');
    await addDoc(auditRef, {
      type: event.type,
      description: event.description,
      meta: event.meta || {},
      userId,
      userName,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
    // We don't want to throw and block the main transaction if audit logging fails
  }
}
