import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { useSecureCashierStore } from '../src/store/use-secure-cashier-store';

function makeBootstrap(products: Array<any>, overrides: Record<string, any> = {}) {
  return {
    tenantId: 'tenant_test',
    tenantDisplayName: 'Test Store',
    staffAccountId: 'staff_1',
    staffDisplayName: 'Test Cashier',
    currentShift: {
      id: 'shift_1',
      tenantId: 'tenant_test',
      moduleId: 'benta-snap',
      staffId: 'staff_1',
      staffAccountId: 'staff_1',
      cashSales: 0,
      gcashSales: 0,
      mayaSales: 0,
      totalShiftSales: 0,
      electronicReceipts: 0,
      physicalCashAdjustments: 0,
      saleCount: 0,
      startingCash: 100000,
      openedAt: '2025-01-01T00:00:00.000Z'
    },
    products,
    offlineAuthority: {
      grant: 'grant_1',
      snapshot: 'snapshot_1'
    },
    ...overrides
  };
}

describe('Cashier Bootstrap Stock Reconciliation', () => {
  beforeEach(() => {
    useSecureCashierStore.getState().clearCashierSession();
  });

  afterEach(() => {
    useSecureCashierStore.getState().clearCashierSession();
  });

  it('authoritative bootstrap refresh updates state.bootstrap.products from 9500 to 7500', () => {
    // Initial bootstrap with Nails at 9.500 kg (9500 minor units, scale 3)
    const initialProducts = [
      {
        productId: 'prod_nails',
        id: 'prod_nails',
        name: 'Bakal Na Lagari 1kg',
        unit: 'kg',
        quantityMode: 'measured',
        quantityScale: 3,
        sellingUnit: 'kg',
        salePrice: 11500,
        costPrice: 9500,
        stockQuantityMinor: 9500
      }
    ];

    const initialBootstrap = makeBootstrap(initialProducts);
    useSecureCashierStore.getState().setBootstrap(initialBootstrap);

    // Verify initial state using the authoritative bootstrap path the UI
    // (BentaDashboard) renders from: `cashierBootstrap.products`
    const initialBootstrapState = useSecureCashierStore.getState().bootstrap;
    const initialNails = initialBootstrapState?.products?.find(p => p?.productId === 'prod_nails');
    assert.ok(initialNails, 'Nails product must exist in bootstrap');
    assert.equal(initialNails.stockQuantityMinor, 9500, 'Initial stock must be 9500 minor units');

    // Now simulate the authoritative bootstrap refresh after finalizing a
    // 2 kg sale: 2 kg at scale 3 = 2000 minor units → 9500 - 2000 = 7500
    const authoritativeProducts = [
      {
        productId: 'prod_nails',
        id: 'prod_nails',
        name: 'Bakal Na Lagari 1kg',
        unit: 'kg',
        quantityMode: 'measured',
        quantityScale: 3,
        sellingUnit: 'kg',
        salePrice: 11500,
        costPrice: 9500,
        stockQuantityMinor: 7500
      }
    ];

    useSecureCashierStore.getState().setBootstrap(makeBootstrap(authoritativeProducts));

    // Assert the authoritative bootstrap state consumed by the Cashier UI changed
    const updatedBootstrap = useSecureCashierStore.getState().bootstrap;
    const updatedNails = updatedBootstrap?.products?.find(p => p?.productId === 'prod_nails');
    assert.ok(updatedNails, 'Nails product must still exist in bootstrap');
    assert.equal(updatedNails.stockQuantityMinor, 7500,
      'After bootstrap refresh, state.bootstrap.products consumed by Cashier UI must reflect authoritative 7500');

    // Also assert the products array mirror is consistent
    const updatedMirror = useSecureCashierStore.getState().products.find(p => p?.productId === 'prod_nails');
    assert.equal(updatedMirror?.stockQuantityMinor, 7500, 'products mirror must also reflect 7500');
  });

  it('discrete products are not affected by measured stock reconciliation', () => {
    const products = [
      {
        productId: 'prod_rice',
        id: 'prod_rice',
        name: 'Rice 1kg',
        unit: 'kg',
        quantityMode: 'discrete',
        salePrice: 5500,
        costPrice: 4200,
        currentStock: 50
      },
      {
        productId: 'prod_nails',
        id: 'prod_nails',
        name: 'Bakal Na Lagari 1kg',
        unit: 'kg',
        quantityMode: 'measured',
        quantityScale: 3,
        sellingUnit: 'kg',
        salePrice: 11500,
        costPrice: 9500,
        stockQuantityMinor: 7500
      }
    ];

    useSecureCashierStore.getState().setBootstrap(makeBootstrap(products));

    const updatedBootstrap = useSecureCashierStore.getState().bootstrap;
    const rice = updatedBootstrap?.products?.find(p => p?.productId === 'prod_rice');
    const nails = updatedBootstrap?.products?.find(p => p?.productId === 'prod_nails');

    assert.equal(rice?.currentStock, 50, 'Discrete product stock must be unchanged');
    assert.equal(nails?.stockQuantityMinor, 7500, 'Measured product stock must reflect bootstrap value');
  });

  it('does not fabricate stock from receipt data — only accepts bootstrap', () => {
    // Set up initial bootstrap with Nails at 7500 (post-sale authoritative state)
    const products = [
      {
        productId: 'prod_nails',
        id: 'prod_nails',
        name: 'Bakal Na Lagari 1kg',
        unit: 'kg',
        quantityMode: 'measured',
        quantityScale: 3,
        sellingUnit: 'kg',
        salePrice: 11500,
        costPrice: 9500,
        stockQuantityMinor: 7500
      }
    ];

    useSecureCashierStore.getState().setBootstrap(makeBootstrap(products));

    // Now set a receipt that shows a 2kg sale (2000 minor units)
    const fakeReceipt = {
      receiptNumber: 'R-001',
      saleId: 'sale_1',
      items: [{
        productId: 'prod_nails',
        quantityMode: 'measured',
        quantityMinor: 2000,
        quantityScale: 3,
        subtotalCentavos: 23000
      }],
      totalCentavos: 23000
    };

    useSecureCashierStore.getState().setLastReceipt(fakeReceipt as any);

    // Stock must remain at 7500 — not decremented from receipt data
    const nails = useSecureCashierStore.getState().bootstrap?.products?.find(p => p?.productId === 'prod_nails');
    assert.equal(nails?.stockQuantityMinor, 7500, 'Stock must be bootstrap-authoritative, not receipt-derived');
  });
});