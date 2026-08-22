import { getAuth } from 'firebase/auth';
import { app } from '@/firebase/config';

export interface OwnerCashierItem {
  id: string;
  username: string;
  status: 'active' | 'disabled' | string;
  createdAt: string | null;
  lastLoginAt: string | null;
  actionsAvailable: {
    resetPin: boolean;
    disable: boolean;
    remove: boolean;
  };
}

async function getOwnerAuthToken(): Promise<string> {
  const auth = getAuth(app);
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Kailangan munang mag-log in bilang may-ari ng tindahan.');
  }
  return currentUser.getIdToken();
}

/**
 * Lists Cashier accounts for the specified tenant via trusted owner API.
 */
export async function listOwnerCashiers(tenantId: string): Promise<OwnerCashierItem[]> {
  const token = await getOwnerAuthToken();
  const response = await fetch(`/api/owner/cashiers?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Hindi ma-load ang mga Cashier account.');
  }

  return data.cashiers || [];
}

/**
 * Creates a new Cashier account via trusted owner API.
 */
export async function createOwnerCashier(
  tenantId: string,
  username: string,
  pin: string
): Promise<{ id: string; username: string; status: string }> {
  const token = await getOwnerAuthToken();
  const response = await fetch('/api/owner/cashiers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ tenantId, username, pin })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Hindi ma-create ang Cashier account.');
  }

  return data.cashier;
}

/**
 * Resets the 4-digit PIN for a Cashier account via trusted owner API.
 */
export async function resetOwnerCashierPin(
  tenantId: string,
  staffAccountId: string,
  newPin: string
): Promise<void> {
  const token = await getOwnerAuthToken();
  const response = await fetch('/api/owner/cashiers/reset-pin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ tenantId, staffAccountId, newPin })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Hindi ma-reset ang PIN ng Cashier.');
  }
}

/**
 * Disables a Cashier account via trusted owner API.
 */
export async function disableOwnerCashier(
  tenantId: string,
  staffAccountId: string
): Promise<void> {
  const token = await getOwnerAuthToken();
  const response = await fetch('/api/owner/cashiers/disable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ tenantId, staffAccountId })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Hindi ma-disable ang Cashier account.');
  }
}

/**
 * Removes a Cashier account via trusted owner API.
 */
export async function removeOwnerCashier(
  tenantId: string,
  staffAccountId: string
): Promise<void> {
  const token = await getOwnerAuthToken();
  const response = await fetch('/api/owner/cashiers/remove', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ tenantId, staffAccountId })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Hindi ma-remove ang Cashier account.');
  }
}
