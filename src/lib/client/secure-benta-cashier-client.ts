/**
 * Client API module for Secure Benta Snap Cashier Journey
 *
 * Provides client-side helpers communicating with trusted server endpoints:
 * - staffPinLogin (POST /api/auth/staff-pin-login)
 * - fetchBentaBootstrap (GET /api/cashier/benta-bootstrap)
 * - openBentaShift (POST /api/cashier/benta-shift-open)
 * - checkoutBenta (POST /api/cashier/benta-checkout)
 * - fetchBentaReceipt (GET /api/cashier/benta-receipt)
 * - reconcileAndCloseShift (POST /api/cashier/benta-shift-reconciliation)
 * - staffLogout (POST /api/auth/staff-logout)
 */

export interface StaffPinLoginResponse {
  success: boolean;
  customToken: string;
  tenantId: string;
  authUid: string;
  sessionVersion: number;
  tenantName: string;
  moduleType: string;
  staffAccount: {
    id: string;
    username: string;
    status: string;
  };
}

export interface SanitizedBootstrapProduct {
  id: string;
  name: string;
  salePrice: number;
  currentStock: number;
  unit: string;
  isActive: true;
  sku?: string;
  barcode?: string;
  category?: string;
  minStock?: number;
}

export interface SanitizedBootstrapShift {
  id: string;
  moduleId: 'benta-snap';
  status: 'open';
  startingCashCentavos: number;
  openedAt: string;
}

export interface ClientSafeCatalogSnapshot {
  snapshotId: string;
  catalogDigest: string;
  productCount: number;
  products: Record<string, {
    id: string;
    name: string;
    salePriceCentavos: number;
    unit: string;
    category?: string;
    sku?: string;
    barcode?: string;
    isActive: true;
  }>;
}

export interface BentaCashierBootstrapResponse {
  tenantId: string;
  tenantDisplayName: string;
  moduleId: 'benta-snap';
  staffAccountId: string;
  cashierDisplayName: string;
  currentShift: SanitizedBootstrapShift | null;
  products: SanitizedBootstrapProduct[];
  offlineAuthority?: {
    grant: any;
    snapshot: ClientSafeCatalogSnapshot;
    stockBaseline: Record<string, number>;
    stockCapturedAtIso: string;
  };
}

export interface SanitizedShiftOpenResult {
  shiftId: string;
  openedAt: string;
  moduleId: 'benta-snap';
  status: 'open' | 'closed';
  startingCashCentavos: number;
}

export type CheckoutPaymentMethod = 'cash' | 'gcash' | 'maya';

export interface CheckoutReceiptItem {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPriceCentavos: number;
  lineTotalCentavos: number;
}

export interface CheckoutReceipt {
  saleId: string;
  receiptNumber: string;
  committedAt: string;
  moduleId: 'benta-snap';
  paymentMethod: CheckoutPaymentMethod;
  shiftId: string;
  cashierDisplayName: string;
  items: CheckoutReceiptItem[];
  subtotalCentavos: number;
  totalCentavos: number;
}

export interface ShiftReconciliationSummary {
  reconciliationVersion: 1;
  shiftId: string;
  startingCashCentavos: number;
  cashSales: number;
  gcashSales: number;
  mayaSales: number;
  totalShiftSales: number;
  electronicReceipts: number;
  physicalCashAdjustments: 0;
  saleCount: number;
  expectedPhysicalCashCentavos: number;
  endingCashCentavos: number;
  discrepancyCentavos: number;
  closedAt: string;
}

/**
 * 1. Authenticate Cashier via server PIN login endpoint
 */
export async function staffPinLogin(
  businessCode: string,
  username: string,
  pin: string,
  fetchFn: typeof fetch = fetch
): Promise<StaffPinLoginResponse> {
  const cleanCode = businessCode.trim().toUpperCase();
  const cleanUser = username.trim().toLowerCase();
  const cleanPin = pin.trim();

  const response = await fetchFn('/api/auth/staff-pin-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      businessCode: cleanCode,
      username: cleanUser,
      pin: cleanPin
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMsg = data?.error || 'Maling Business Code, Username, o PIN. Paki-check at subukan muli.';
    const error: any = new Error(errorMsg);
    error.status = response.status;
    error.retryAfter = data?.retryAfter;
    throw error;
  }

  return data;
}

/**
 * 2. Load authoritative Cashier bootstrap
 */
export async function fetchBentaBootstrap(
  idToken: string,
  fetchFn: typeof fetch = fetch
): Promise<BentaCashierBootstrapResponse> {
  let installationId: string | null = null;
  try {
    const { getJournalDB } = await import('../offline/journal-db');
    installationId = await getJournalDB().getOrCreateInstallationId();
  } catch {
    installationId = null;
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${idToken}`
  };
  if (installationId && typeof installationId === 'string' && installationId.trim().length > 0) {
    headers['x-installation-id'] = installationId.trim();
  }

  const response = await fetchFn('/api/cashier/benta-bootstrap', {
    method: 'GET',
    headers
  });

  const data = await response.json();
  if (!response.ok) {
    const error: any = new Error(data?.error || 'Hindi ma-load ang cashier bootstrap.');
    error.status = response.status;
    error.category = data?.category;
    throw error;
  }

  // Cache offline grant and catalog snapshot in IndexedDB with exact bootstrap metadata
  if (data.offlineAuthority?.grant && data.offlineAuthority?.snapshot) {
    try {
      const { getJournalDB } = await import('../offline/journal-db');
      await getJournalDB().saveAuthorityContext(
        data.offlineAuthority.grant,
        data.offlineAuthority.snapshot,
        {
          tenantDisplayName: data.tenantDisplayName,
          cashierDisplayName: data.cashierDisplayName,
          currentShift: data.currentShift
        }
      );
    } catch (cacheErr) {
      console.warn('[OFFLINE_BOOTSTRAP] Failed caching authority context in IndexedDB:', cacheErr);
    }
  }

  return data;
}

/**
 * 3. Open Cashier Shift with integer centavos and stable UUID idempotency key
 */
export async function openBentaShift(
  idToken: string,
  idempotencyKey: string,
  startingCashCentavos: number,
  fetchFn: typeof fetch = fetch
): Promise<SanitizedShiftOpenResult> {
  const response = await fetchFn('/api/cashier/benta-shift-open', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      idempotencyKey,
      startingCashCentavos
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const error: any = new Error(data?.error || 'Hindi masimulan ang shift.');
    error.status = response.status;
    error.category = data?.category;
    throw error;
  }

  return data;
}

/**
 * 4. Trusted Checkout with stable UUID idempotency key
 */
export async function checkoutBenta(
  idToken: string,
  payload: {
    idempotencyKey: string;
    shiftId: string;
    items: Array<{ productId: string; quantity: number }>;
    paymentMethod: CheckoutPaymentMethod;
    paymentReference?: string;
  },
  fetchFn: typeof fetch = fetch
): Promise<CheckoutReceipt> {
  const body: any = {
    idempotencyKey: payload.idempotencyKey,
    moduleId: 'benta-snap',
    shiftId: payload.shiftId,
    items: payload.items,
    paymentMethod: payload.paymentMethod
  };

  if (payload.paymentReference && payload.paymentMethod !== 'cash') {
    body.paymentReference = payload.paymentReference.trim();
  }

  const response = await fetchFn('/api/cashier/benta-checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) {
    const error: any = new Error(data?.error || 'Hindi ma-proseso ang bayad.');
    error.status = response.status;
    error.category = data?.category;
    throw error;
  }

  return data;
}

/**
 * 5. Fetch single receipt from current shift
 */
export async function fetchBentaReceipt(
  idToken: string,
  saleId: string,
  fetchFn: typeof fetch = fetch
): Promise<CheckoutReceipt> {
  const response = await fetchFn(`/api/cashier/benta-receipt?saleId=${encodeURIComponent(saleId)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${idToken}`
    }
  });

  const data = await response.json();
  if (!response.ok) {
    const error: any = new Error(data?.error || 'Hindi mahanap ang resibo.');
    error.status = response.status;
    error.category = data?.category;
    throw error;
  }

  return data;
}

/**
 * 6. Close Shift & Reconcile Cash
 */
export async function reconcileAndCloseShift(
  idToken: string,
  shiftId: string,
  endingCashCentavos: number,
  notes?: string,
  fetchFn: typeof fetch = fetch
): Promise<ShiftReconciliationSummary> {
  const response = await fetchFn('/api/cashier/benta-shift-reconciliation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      shiftId,
      endingCashCentavos,
      ...(notes ? { notes } : {})
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const error: any = new Error(data?.error || 'Hindi maisara ang shift.');
    error.status = response.status;
    error.category = data?.category;
    throw error;
  }

  return data;
}

/**
 * 7. Trusted Logout / Session Revocation
 */
export async function staffLogout(
  idToken: string,
  fetchFn: typeof fetch = fetch
): Promise<{ success: boolean }> {
  const response = await fetchFn('/api/auth/staff-logout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`
    }
  });

  const data = await response.json();
  if (!response.ok) {
    const error: any = new Error(data?.error || 'Hindi ma-proseso ang logout.');
    error.status = response.status;
    error.category = data?.category;
    throw error;
  }

  return data;
}

/**
 * 8. Cashier Logout Coordinator
 * Coordinates authoritative server session revocation first, followed by client Firebase sign-out and guaranteed local state clearing.
 * Accepts optional dependency injections for server logout and Firebase client signOut while always using genuine production defaults.
 */
export async function executeCashierLogoutCoordinator(
  params: {
    getIdToken: () => Promise<string>;
    serverLogoutFn?: (idToken: string) => Promise<{ success: boolean }>;
    firebaseSignOutFn?: () => Promise<void>;
    onLocalStateCleanup: () => void;
    onRedirect: () => void;
  }
): Promise<void> {
  // 1. Authoritative server revocation MUST complete first
  const idToken = await params.getIdToken();
  const serverRevoke = params.serverLogoutFn || staffLogout;
  await serverRevoke(idToken);

  // 2. Complete Firebase client sign-out using genuine default or injected handler
  const signOutClient = params.firebaseSignOutFn || (async () => {
    const { signOut } = await import('firebase/auth');
    const { initializeFirebase } = await import('@/firebase');
    await signOut(initializeFirebase().auth);
  });

  try {
    await signOutClient();
  } catch (signOutErr) {
    console.warn('Firebase signOut error after verified server revocation:', signOutErr);
  }

  // 3. Guaranteed local state cleanup
  params.onLocalStateCleanup();

  // 4. Safe navigation to login
  params.onRedirect();
}

/**
 * 9. Fetch WebAuthn Registration Options
 */
export async function fetchWebAuthnRegistrationOptions(
  idToken: string,
  installationId: string
): Promise<{ options: any; deviceNameSuggested: string }> {
  const response = await fetch('/api/cashier/webauthn/register-options', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
      'x-installation-id': installationId
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch WebAuthn registration options.');
  }

  return data;
}

/**
 * 10. Submit WebAuthn Registration Verification
 */
export async function submitWebAuthnRegistrationVerify(
  idToken: string,
  installationId: string,
  registrationResponse: any,
  deviceName: string
): Promise<{ success: boolean; trustedDevice: any }> {
  const response = await fetch('/api/cashier/webauthn/register-verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
      'x-installation-id': installationId
    },
    body: JSON.stringify({
      response: registrationResponse,
      deviceName
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to verify WebAuthn registration.');
  }

  return data;
}

