import { getJournalDB, JournalDB } from '../offline/journal-db';
import {
  OfflineAuthGrant,
  ClientCatalogSnapshotItem,
  JournalSaleEntry,
  JournalShiftCloseEntry
} from '../offline/offline-types';
import {
  BentaCashierBootstrapResponse,
  SanitizedBootstrapProduct,
  SanitizedBootstrapShift
} from './secure-benta-cashier-client';

export interface OfflineCheckoutParams {
  tenantId: string;
  staffAccountId: string;
  shiftId: string;
  cartItems: Array<{ productId: string; quantity: number }>;
  idempotencyKey: string;
}

export interface ProvisionalReceiptResult {
  receiptNumber: string;
  isProvisional: true;
  items: Array<{
    productId: string;
    name: string;
    unitPriceCentavos: number;
    quantity: number;
    unit: string;
    lineTotalCentavos: number;
  }>;
  totalCentavos: number;
  paymentMethod: 'cash';
  clientTimestamp: string;
}

export class CashierOfflineManager {
  private journalDB: JournalDB;

  constructor(journalDB?: JournalDB) {
    this.journalDB = journalDB || getJournalDB();
  }

  /**
   * Restores cached bootstrap, grant, catalog snapshot, and shift context after an offline reload.
   * Fails closed if exact cached bootstrap metadata is absent. Never invents stock or financial values.
   */
  public async restoreOfflineContext(
    tenantId?: string,
    staffAccountId?: string,
    shiftId?: string
  ): Promise<{
    restored: boolean;
    bootstrap?: BentaCashierBootstrapResponse;
    grant?: OfflineAuthGrant;
    pendingCount: number;
    isShiftClosed?: boolean;
    reason?: string;
  }> {
    try {
      let effectiveTenantId = tenantId;
      let effectiveStaffId = staffAccountId;
      let effectiveShiftId = shiftId;

      if (!effectiveTenantId || !effectiveStaffId || !effectiveShiftId) {
        const latestGrant = await this.journalDB.getLatestGrant();
        if (latestGrant) {
          effectiveTenantId = latestGrant.payload.tenantId;
          effectiveStaffId = latestGrant.payload.staffAccountId;
          effectiveShiftId = latestGrant.payload.shiftId;
        }
      }

      if (!effectiveTenantId || !effectiveStaffId || !effectiveShiftId) {
        return { restored: false, pendingCount: 0, reason: 'no_grant_found' };
      }

      const authority = await this.journalDB.getAuthorityContext(
        effectiveTenantId,
        effectiveStaffId,
        effectiveShiftId
      );

      if (!authority.grant || !authority.snapshot) {
        return { restored: false, pendingCount: 0, reason: 'incomplete_authority_context' };
      }

      // Mandatory Requirement: Fail closed if exact stock baseline is absent
      if (!authority.stockBaseline || typeof authority.stockBaseline !== 'object') {
        return {
          restored: false,
          pendingCount: 0,
          reason: 'missing_stock_baseline'
        };
      }

      // Mandatory Requirement: Fail closed if exact cached bootstrap metadata is absent
      const meta = authority.bootstrapMeta;
      if (
        !meta ||
        !meta.tenantDisplayName ||
        !meta.cashierDisplayName ||
        !meta.currentShift ||
        typeof meta.currentShift.startingCashCentavos !== 'number' ||
        !meta.currentShift.openedAt
      ) {
        return {
          restored: false,
          pendingCount: 0,
          reason: 'missing_exact_bootstrap_metadata'
        };
      }

      const isShiftClosed = await this.journalDB.isShiftProvisionallyClosed(
        effectiveTenantId,
        effectiveStaffId,
        effectiveShiftId
      );

      const pendingDeductions = await this.journalDB.getPendingDeductionsMap(
        effectiveTenantId,
        effectiveStaffId,
        effectiveShiftId
      );

      const pendingEntries = await this.journalDB.getPendingEntries(
        effectiveTenantId,
        effectiveStaffId,
        effectiveShiftId
      );

      // Derive projected stock strictly from persisted stock baseline minus unconfirmed pending deductions
      const products: SanitizedBootstrapProduct[] = [];
      for (const p of Object.values(authority.snapshot.products || {})) {
        const prod = p as ClientCatalogSnapshotItem;
        const baselineStock = authority.stockBaseline[prod.id];
        if (typeof baselineStock !== 'number') {
          return {
            restored: false,
            pendingCount: 0,
            reason: 'missing_product_stock_baseline'
          };
        }
        const deducted = pendingDeductions[prod.id] || 0;
        const projectedStock = Math.max(0, baselineStock - deducted);

        products.push({
          id: prod.id,
          name: prod.name,
          salePrice: prod.salePriceCentavos / 100,
          currentStock: projectedStock,
          unit: prod.unit,
          isActive: true,
          sku: prod.sku,
          barcode: prod.barcode,
          category: prod.category
        });
      }

      const currentShift: SanitizedBootstrapShift = {
        id: meta.currentShift.id || effectiveShiftId,
        moduleId: 'benta-snap',
        status: meta.currentShift.status || 'open',
        startingCashCentavos: meta.currentShift.startingCashCentavos,
        openedAt: meta.currentShift.openedAt
      };

      const restoredBootstrap: BentaCashierBootstrapResponse = {
        tenantId: effectiveTenantId,
        tenantDisplayName: meta.tenantDisplayName,
        moduleId: 'benta-snap',
        staffAccountId: effectiveStaffId,
        cashierDisplayName: meta.cashierDisplayName,
        currentShift,
        products,
        offlineAuthority: {
          grant: authority.grant,
          snapshot: authority.snapshot,
          stockBaseline: authority.stockBaseline,
          stockCapturedAtIso: authority.stockCapturedAtIso || new Date().toISOString()
        }
      };

      return {
        restored: true,
        bootstrap: restoredBootstrap,
        grant: authority.grant,
        pendingCount: pendingEntries.length,
        isShiftClosed
      };
    } catch (err) {
      console.warn('[OFFLINE_MANAGER] Failed restoring offline context:', err);
      return { restored: false, pendingCount: 0, reason: 'exception_during_restoration' };
    }
  }

  /**
   * Verified WebAuthn Offline Unlock:
   * Verifies local cryptographic assertion against the registered trusted device public key
   * and verifies that the trusted device matches the offline grant's bound credential hashes.
   */
  public async unlockViaWebAuthn(params: {
    assertionResponse: any;
    challengeBytes: Uint8Array;
    tenantId: string;
    staffAccountId: string;
    installationId: string;
    shiftId?: string;
    expectedOrigin?: string;
  }): Promise<{ success: boolean; error?: string; warning?: string }> {
    const { assertionResponse, challengeBytes, tenantId, staffAccountId, installationId, shiftId, expectedOrigin } = params;

    const trustedDevice = await this.journalDB.getTrustedDevice(tenantId, staffAccountId, installationId);
    if (!trustedDevice) {
      return {
        success: false,
        error: 'Walang nakarehistrong trusted device para sa offline session na ito. Kinakailangan mag-login online.'
      };
    }

    // Validate Grant-WebAuthn Bindings if grant is present
    const scopedGrant = shiftId
      ? await this.journalDB.getScopedGrant(tenantId, staffAccountId, shiftId)
      : await this.journalDB.getLatestGrant();

    if (scopedGrant) {
      const grantPayload = scopedGrant.payload;
      if (
        grantPayload.tenantId !== tenantId ||
        grantPayload.staffAccountId !== staffAccountId ||
        grantPayload.installationId !== installationId
      ) {
        return {
          success: false,
          error: 'credential_grant_binding_mismatch: Identity bindings in grant do not match this device session.'
        };
      }

      if (
        (grantPayload.credentialIdHash && grantPayload.credentialIdHash !== trustedDevice.credentialIdHash) ||
        (grantPayload.credentialPublicKeyHash && grantPayload.credentialPublicKeyHash !== trustedDevice.credentialPublicKeyHash) ||
        (!grantPayload.credentialPublicKeyHash && grantPayload.credentialIdHash)
      ) {
        return {
          success: false,
          error: 'credential_grant_binding_mismatch: The registered credential on this device does not match the signed offline grant.'
        };
      }
    }

    const { getWebAuthnClientVerifier } = await import('./webauthn-client-verifier');
    const verifier = getWebAuthnClientVerifier();

    const verificationResult = await verifier.verifyOfflineAssertion(
      assertionResponse,
      challengeBytes,
      trustedDevice,
      expectedOrigin
    );

    if (!verificationResult.isValid) {
      return {
        success: false,
        error: verificationResult.error || 'Hindi matagumpay ang WebAuthn unlock verification.'
      };
    }

    // Atomically update signature counter in IndexedDB if new counter is non-zero
    if (verificationResult.newCounter !== undefined && verificationResult.newCounter > 0) {
      await this.journalDB.updateTrustedDeviceCounter(
        tenantId,
        staffAccountId,
        installationId,
        verificationResult.newCounter
      );
    }

    return { success: true };
  }

  /**
   * Evaluates background inactivity: 15-minute continuous background threshold without polling.
   */
  public shouldLockForInactivity(lastBackgroundedTimestamp: number | null): boolean {
    if (!lastBackgroundedTimestamp) return false;
    const elapsedMs = Date.now() - lastBackgroundedTimestamp;
    return elapsedMs >= 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Executes a strict offline Cash checkout validated against the grant-bound catalog snapshot
   * and bound trusted device credential.
   */
  public async executeOfflineCashCheckout(params: OfflineCheckoutParams): Promise<ProvisionalReceiptResult> {
    const { tenantId, staffAccountId, shiftId, cartItems, idempotencyKey } = params;

    if (!cartItems || cartItems.length === 0) {
      throw new Error('Walang laman ang cart.');
    }

    const isClosed = await this.journalDB.isShiftProvisionallyClosed(tenantId, staffAccountId, shiftId);
    if (isClosed) {
      throw new Error('Naisara na ang shift na ito. Naka-freeze ang pagtitinda hanggang sa ma-sync sa server.');
    }

    const installationId = await this.journalDB.getOrCreateInstallationId();
    const authority = await this.journalDB.getAuthorityContext(tenantId, staffAccountId, shiftId);

    if (!authority.grant || !authority.snapshot) {
      throw new Error('Walang offline authorization grant sa device. Mag-online muna upang makakuha ng pahintulot.');
    }

    const grant = authority.grant.payload;

    // Strict local authority binding validation
    if (grant.tenantId !== tenantId) {
      throw new Error('Security Error: Grant tenantId mismatch.');
    }
    if (grant.staffAccountId !== staffAccountId) {
      throw new Error('Security Error: Grant staffAccountId mismatch.');
    }
    if (grant.shiftId !== shiftId) {
      throw new Error('Security Error: Grant shiftId mismatch.');
    }
    if (grant.installationId !== installationId) {
      throw new Error('Security Error: Grant installationId mismatch with this device.');
    }
    if (grant.snapshotId !== authority.snapshot.snapshotId || grant.catalogDigest !== authority.snapshot.catalogDigest) {
      throw new Error('Security Error: Grant catalog snapshot mismatch.');
    }
    if (!Array.isArray(grant.allowedTenders) || !grant.allowedTenders.includes('cash')) {
      throw new Error('Security Error: Offline grant does not permit Cash sales.');
    }

    // Validate trusted device binding
    if (grant.credentialIdHash) {
      const trustedDevice = await this.journalDB.getTrustedDevice(tenantId, staffAccountId, installationId);
      if (
        !trustedDevice ||
        trustedDevice.credentialIdHash !== grant.credentialIdHash ||
        (grant.credentialPublicKeyHash && trustedDevice.credentialPublicKeyHash !== grant.credentialPublicKeyHash)
      ) {
        throw new Error('credential_grant_binding_mismatch: Trusted device is missing or does not match the offline grant.');
      }
    }

    const snapshotProducts = authority.snapshot.products || {};
    const validatedItems = [];

    // Strict snapshot validation: Every item MUST exist and be active in the snapshot!
    for (const item of cartItems) {
      const snapProd = snapshotProducts[item.productId];
      if (!snapProd || !snapProd.isActive) {
        throw new Error(`Ang item na "${item.productId}" ay wala o hindi aktibo sa offline catalog snapshot.`);
      }
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
        throw new Error(`Maling dami para sa item na "${snapProd.name}".`);
      }

      const unitPriceCentavos = snapProd.salePriceCentavos;
      const lineTotalCentavos = unitPriceCentavos * item.quantity;

      validatedItems.push({
        productId: item.productId,
        name: snapProd.name,
        unitPriceCentavos,
        quantity: item.quantity,
        unit: snapProd.unit,
        lineTotalCentavos
      });
    }

    const totalCentavos = validatedItems.reduce((sum, it) => sum + it.lineTotalCentavos, 0);
    const clientTimestamp = new Date().toISOString();

    let createdEntry: JournalSaleEntry;
    try {
      createdEntry = await this.journalDB.appendJournalEntry({
        tenantId,
        staffAccountId,
        shiftId,
        grantId: grant.grantId,
        snapshotId: grant.snapshotId,
        idempotencyKey,
        clientTimestamp,
        items: validatedItems,
        subtotalCentavos: totalCentavos,
        totalCentavos,
        cashTenderedCentavos: totalCentavos,
        changeCentavos: 0
      });
    } catch (storageErr) {
      throw new Error('Storage failed. Do not clear app data. Hindi maitala ang offline na benta sa database ng device.');
    }

    return {
      receiptNumber: createdEntry.provisionalReceiptNumber,
      isProvisional: true,
      items: validatedItems,
      totalCentavos,
      paymentMethod: 'cash',
      clientTimestamp
    };
  }

  /**
   * Durably closes shift locally when offline, freezing further sales until synchronization.
   */
  public async provisionalCloseShift(params: {
    tenantId: string;
    staffAccountId: string;
    shiftId: string;
    endingCashCentavos: number;
    notes?: string;
  }): Promise<JournalShiftCloseEntry> {
    const authority = await this.journalDB.getAuthorityContext(params.tenantId, params.staffAccountId, params.shiftId);
    if (!authority.grant || !authority.snapshot) {
      throw new Error('Walang offline authority para sa shift na ito.');
    }

    return await this.journalDB.appendShiftCloseEntry({
      tenantId: params.tenantId,
      staffAccountId: params.staffAccountId,
      shiftId: params.shiftId,
      grantId: authority.grant.payload.grantId,
      snapshotId: authority.grant.payload.snapshotId,
      endingCashCentavos: params.endingCashCentavos,
      notes: params.notes
    });
  }

  /**
   * Calculates projected inventory stock combining baseline stock and unconfirmed pending deductions.
   */
  public calculateProjectedStock(
    stockBaseline: Record<string, number>,
    pendingDeductions: Record<string, number>
  ): Record<string, number> {
    const projected: Record<string, number> = {};
    for (const [productId, initialStock] of Object.entries(stockBaseline || {})) {
      const deducted = pendingDeductions[productId] || 0;
      projected[productId] = Math.max(0, (initialStock || 0) - deducted);
    }
    return projected;
  }
}

let globalOfflineManager: CashierOfflineManager | null = null;

export function getCashierOfflineManager(): CashierOfflineManager {
  if (!globalOfflineManager) {
    globalOfflineManager = new CashierOfflineManager();
  }
  return globalOfflineManager;
}
