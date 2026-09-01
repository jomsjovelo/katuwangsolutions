import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BENTA_INVENTORY_COSTING_VERSION,
  isBentaExactPoolCostedSale,
  assertLegacyBentaSaleMutable,
  BentaExactPoolSaleMutationError,
} from '../src/lib/shared/benta-sale-mutation-guard';

test('BENTA_INVENTORY_COSTING_VERSION is moving_average_v1', () => {
  assert.equal(BENTA_INVENTORY_COSTING_VERSION, 'moving_average_v1');
});

test('isBentaExactPoolCostedSale: explicit moving_average_v1 marker is protected', () => {
  const exactPoolSale = {
    costingVersion: 'moving_average_v1',
    items: [{ productId: 'prod_1', quantity: 1 }],
  };
  assert.equal(isBentaExactPoolCostedSale(exactPoolSale), true);
});

test('isBentaExactPoolCostedSale: direct secure cashier pre-marker shape is protected', () => {
  const cashierPreMarkerSale = {
    moduleId: 'benta-snap',
    shiftId: 'shift_abc123',
    staffAccountId: 'staff_xyz',
    items: [
      { productId: 'misc-pc-001', quantity: 1 },
      { productId: 'prod_coke', quantity: 2, unitCostCentavos: 5000 },
    ],
  };
  assert.equal(isBentaExactPoolCostedSale(cashierPreMarkerSale), true);
});

test('isBentaExactPoolCostedSale: intent-finalized pre-marker shape is protected', () => {
  const intentPreMarkerSale = {
    moduleId: 'benta-snap',
    shiftId: 'shift_intent_1',
    staffAccountId: 'staff_juan',
    items: [
      { productId: 'prod_rice', quantity: 1, lineCostCentavos: 30000 },
      { productId: 'misc-pc-002', quantity: 1 },
    ],
  };
  assert.equal(isBentaExactPoolCostedSale(intentPreMarkerSale), true);
});

test('isBentaExactPoolCostedSale: offline-sync pre-marker shape is protected', () => {
  const syncPreMarkerSale = {
    moduleId: 'benta-snap',
    shiftId: 'shift_offline_1',
    staffAccountId: 'staff_cashier',
    items: [
      { productId: 'misc-pc-003', quantity: 1 },
      { productId: 'prod_sugar', quantity: 5, unitCostCentavos: 2500, lineCostCentavos: 12500 },
    ],
  };
  assert.equal(isBentaExactPoolCostedSale(syncPreMarkerSale), true);
});

test('isBentaExactPoolCostedSale: partial historical costing metadata fails closed', () => {
  const partialMetadataSale = {
    moduleId: 'benta-snap',
    shiftId: 'shift_partial',
    staffAccountId: 'staff_partial',
    items: [
      { productId: 'prod_test', quantity: 1 },
    ],
  };
  assert.equal(isBentaExactPoolCostedSale(partialMetadataSale), false);
});

test('isBentaExactPoolCostedSale: malformed secure-cashier costing metadata fails closed', () => {
  const malformedSale = {
    moduleId: 'benta-snap',
    shiftId: 'shift_malformed',
    staffAccountId: 'staff_malformed',
    items: [
      { productId: 'misc-pc-001', quantity: 1 },
    ],
  };
  assert.equal(isBentaExactPoolCostedSale(malformedSale), false);
});

test('isBentaExactPoolCostedSale: ordinary legacy retail sale remains mutable', () => {
  const legacySale = {
    moduleId: 'retail',
    items: [
      { productId: 'prod_legacy', quantity: 1, costPrice: 1000, unitCostCentavos: 1000, lineCostCentavos: 1000 },
    ],
  };
  assert.equal(isBentaExactPoolCostedSale(legacySale), false);
});

test('isBentaExactPoolCostedSale: legacy sale with cost fields but no secure server metadata remains mutable', () => {
  const legacyCostSale = {
    items: [
      { productId: 'prod_legacy', quantity: 1, unitCostCentavos: 500, lineCostCentavos: 500 },
    ],
  };
  assert.equal(isBentaExactPoolCostedSale(legacyCostSale), false);
});

test('isBentaExactPoolCostedSale: null and undefined return false', () => {
  assert.equal(isBentaExactPoolCostedSale(null), false);
  assert.equal(isBentaExactPoolCostedSale(undefined), false);
});

test('isBentaExactPoolCostedSale: non-object returns false', () => {
  assert.equal(isBentaExactPoolCostedSale('string'), false);
  assert.equal(isBentaExactPoolCostedSale(123), false);
  assert.equal(isBentaExactPoolCostedSale(true), false);
  assert.equal(isBentaExactPoolCostedSale([]), false);
});

test('assertLegacyBentaSaleMutable: edit error is fixed and sanitized', () => {
  const exactPoolSale = {
    costingVersion: 'moving_average_v1',
    items: [{ productId: 'prod_1', quantity: 1 }],
  };
  let thrown: unknown;
  try {
    assertLegacyBentaSaleMutable(exactPoolSale, 'edit');
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown instanceof BentaExactPoolSaleMutationError);
  const err = thrown as BentaExactPoolSaleMutationError;
  assert.equal(err.operation, 'edit');
  assert.equal(err.message, 'Exact-cost sales cannot be edited with legacy logic. Use the exact-pool reversal workflow.');
  assert.equal(err.name, 'BentaExactPoolSaleMutationError');
});

test('assertLegacyBentaSaleMutable: void error is fixed and sanitized', () => {
  const cashierPreMarkerSale = {
    moduleId: 'benta-snap',
    shiftId: 'shift_void_test',
    staffAccountId: 'staff_void',
    items: [
      { productId: 'misc-pc-001', quantity: 1 },
      { productId: 'prod_void', quantity: 2, unitCostCentavos: 5000 },
    ],
  };
  let thrown: unknown;
  try {
    assertLegacyBentaSaleMutable(cashierPreMarkerSale, 'void');
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown instanceof BentaExactPoolSaleMutationError);
  const err = thrown as BentaExactPoolSaleMutationError;
  assert.equal(err.operation, 'void');
  assert.equal(err.message, 'Exact-cost sales cannot be voided with legacy logic. Use the exact-pool reversal workflow.');
});

test('assertLegacyBentaSaleMutable: legacy sale passes without error', () => {
  const legacySale = {
    moduleId: 'retail',
    items: [{ productId: 'prod_legacy', quantity: 1 }],
  };
  assert.doesNotThrow(() => {
    assertLegacyBentaSaleMutable(legacySale, 'edit');
    assertLegacyBentaSaleMutable(legacySale, 'void');
  });
});

test('assertLegacyBentaSaleMutable: input object remains unfrozen and unmodified', () => {
  const sale = {
    costingVersion: 'moving_average_v1',
    items: [{ productId: 'prod_1', quantity: 1 }],
  };
  let thrown: unknown;
  try {
    assertLegacyBentaSaleMutable(sale, 'edit');
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown instanceof BentaExactPoolSaleMutationError);
  assert.equal(Object.isExtensible(sale), true);
  assert.equal(Object.isFrozen(sale), false);
  sale.newField = 'test';
  assert.equal((sale as Record<string, unknown>).newField, 'test');
});

test('assertLegacyBentaSaleMutable: pre-marker cashier sale with only misc items is mutable', () => {
  const miscOnlySale = {
    moduleId: 'benta-snap',
    shiftId: 'shift_misc',
    staffAccountId: 'staff_misc',
    items: [
      { productId: 'misc-pc-001', quantity: 1 },
      { productId: 'misc-pc-002', quantity: 2 },
    ],
  };
  assert.doesNotThrow(() => {
    assertLegacyBentaSaleMutable(miscOnlySale, 'edit');
  });
});

test('assertLegacyBentaSaleMutable: pre-marker sale missing shiftId is mutable', () => {
  const noShiftSale = {
    moduleId: 'benta-snap',
    staffAccountId: 'staff_test',
    items: [
      { productId: 'prod_test', quantity: 1, unitCostCentavos: 1000 },
    ],
  };
  assert.doesNotThrow(() => {
    assertLegacyBentaSaleMutable(noShiftSale, 'edit');
  });
});

test('assertLegacyBentaSaleMutable: pre-marker sale missing staffAccountId is mutable', () => {
  const noStaffSale = {
    moduleId: 'benta-snap',
    shiftId: 'shift_test',
    items: [
      { productId: 'prod_test', quantity: 1, lineCostCentavos: 1000 },
    ],
  };
  assert.doesNotThrow(() => {
    assertLegacyBentaSaleMutable(noStaffSale, 'void');
  });
});

test('assertLegacyBentaSaleMutable: empty items array is mutable', () => {
  const emptyItemsSale = {
    moduleId: 'benta-snap',
    shiftId: 'shift_empty',
    staffAccountId: 'staff_empty',
    items: [],
  };
  assert.doesNotThrow(() => {
    assertLegacyBentaSaleMutable(emptyItemsSale, 'edit');
  });
});

test('assertLegacyBentaSaleMutable: pre-marker with blank shiftId is mutable', () => {
  const blankShiftSale = {
    moduleId: 'benta-snap',
    shiftId: '   ',
    staffAccountId: 'staff_test',
    items: [
      { productId: 'prod_test', quantity: 1, unitCostCentavos: 1000 },
    ],
  };
  assert.doesNotThrow(() => {
    assertLegacyBentaSaleMutable(blankShiftSale, 'edit');
  });
});

test('assertLegacyBentaSaleMutable: pre-marker with blank staffAccountId is mutable', () => {
  const blankStaffSale = {
    moduleId: 'benta-snap',
    shiftId: 'shift_test',
    staffAccountId: '',
    items: [
      { productId: 'prod_test', quantity: 1, unitCostCentavos: 1000 },
    ],
  };
  assert.doesNotThrow(() => {
    assertLegacyBentaSaleMutable(blankStaffSale, 'void');
  });
});
