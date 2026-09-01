import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLegacyPurchaseOrderMutable } from '../src/lib/schemas/supplier';

test('assertLegacyPurchaseOrderMutable correctly rejects moving_average_v1 orders and voided orders', () => {
  const smartPoData = {
    id: 'po_smart_1',
    poNumber: 'PO-20260901-SMART',
    costingVersion: 'moving_average_v1',
    status: 'received',
    totalAmountCentavos: 50000,
    items: [{ productId: 'prod_1', quantity: 10, unitCostCentavos: 5000 }],
  };

  const legacyPoData = {
    id: 'po_legacy_1',
    poNumber: 'PO-20260901-LEGACY',
    status: 'received',
    totalAmountCentavos: 25000,
    items: [{ productId: 'prod_1', quantity: 5, unitCostCentavos: 5000 }],
  };

  const voidedLegacyPoData = {
    ...legacyPoData,
    status: 'voided',
  };

  // 1. Guard check for update operation on smart PO
  assert.throws(
    () => assertLegacyPurchaseOrderMutable(smartPoData, 'update'),
    (err: unknown) =>
      err instanceof Error &&
      err.message.includes('Smart Restocking purchase orders cannot be edited with legacy logic'),
    'assertLegacyPurchaseOrderMutable must reject smart PO on update',
  );

  // 2. Guard check for void operation on smart PO
  assert.throws(
    () => assertLegacyPurchaseOrderMutable(smartPoData, 'void'),
    (err: unknown) =>
      err instanceof Error &&
      err.message.includes('Smart Restocking purchase orders cannot be voided with legacy logic'),
    'assertLegacyPurchaseOrderMutable must reject smart PO on void',
  );

  // 3. Guard check for legacy PO (must succeed without throwing)
  assert.doesNotThrow(
    () => assertLegacyPurchaseOrderMutable(legacyPoData, 'update'),
    'assertLegacyPurchaseOrderMutable must allow legacy PO on update',
  );

  assert.doesNotThrow(
    () => assertLegacyPurchaseOrderMutable(legacyPoData, 'void'),
    'assertLegacyPurchaseOrderMutable must allow legacy PO on void',
  );

  // 4. Voided POs cannot be edited or re-voided
  assert.throws(
    () => assertLegacyPurchaseOrderMutable(voidedLegacyPoData, 'update'),
    (err: unknown) => err instanceof Error && err.message.includes('Cannot edit a voided purchase order'),
  );

  assert.throws(
    () => assertLegacyPurchaseOrderMutable(voidedLegacyPoData, 'void'),
    (err: unknown) => err instanceof Error && err.message.includes('Purchase order is already voided'),
  );

  // 5. Missing PO data throws
  assert.throws(
    () => assertLegacyPurchaseOrderMutable(null, 'update'),
    (err: unknown) => err instanceof Error && err.message.includes('Purchase order not found'),
  );
});
