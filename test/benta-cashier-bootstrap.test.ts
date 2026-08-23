import { CheckoutError, CheckoutErrorCode } from '../src/lib/server/cashier-server-authorization';
import { getBentaCashierBootstrap } from '../src/lib/server/benta-cashier-bootstrap';

let passed = 0; let failed = 0;
function assert(value: unknown, message: string) { if (value) { console.log(`  PASS ${message}`); passed++; } else { console.error(`  FAIL ${message}`); failed++; } }
async function rejects(fn: () => Promise<unknown>, code: CheckoutErrorCode, message: string) { try { await fn(); assert(false, message); } catch (error) { assert(error instanceof CheckoutError && error.code === code, message); } }

function memory(seed: Record<string, any>) {
  const store = structuredClone(seed);
  const query = (path: string, filters: Array<[string, unknown]> = [], maximum = Infinity): any => ({
    path, filters, maximum,
    doc: (id: string) => ({ id, path: `${path}/${id}`, collection: (child: string) => collection(`${path}/${id}/${child}`), get: async () => snapshot({ id, path: `${path}/${id}` }) }),
    where: (field: string, _operator: string, value: unknown) => query(path, [...filters, [field, value]], maximum),
    limit: (value: number) => query(path, filters, value),
    get: async () => querySnapshot({ path, filters, maximum })
  });
  const collection = (path: string): any => query(path);
  const snapshot = (ref: any) => ({ id: ref.id, exists: store[ref.path] !== undefined, data: () => store[ref.path] });
  const querySnapshot = (ref: any) => {
    const docs = Object.entries(store).filter(([path, data]) => path.startsWith(`${ref.path}/`) && path.slice(ref.path.length + 1).split('/').length === 1 && ref.filters.every(([field, value]: [string, unknown]) => (data as any)[field] === value)).slice(0, ref.maximum).map(([path, data]) => ({ id: path.split('/').pop()!, exists: true, data: () => data }));
    return { empty: docs.length === 0, size: docs.length, docs };
  };
  return { store, db: { collection, runTransaction: async (work: (transaction: any) => Promise<unknown>) => work({
    getAll: async (...refs: any[]) => refs.map(snapshot),
    get: async (ref: any) => ref.filters ? querySnapshot(ref) : snapshot(ref)
  }) } as any };
}

const tenantId = 'tenant-1'; const staffId = 'cashier-1';
const claims: Record<string, any> = {
  valid: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: staffId, sessionVersion: 4 },
  stale: { uid: 'uid-1', role: 'cashier', tenantId, staffAccountId: staffId, sessionVersion: 3 },
  wrongTenant: { uid: 'uid-x', role: 'cashier', tenantId: 'tenant-other', staffAccountId: staffId, sessionVersion: 4 },
  wrongRole: { uid: 'uid-1', role: 'owner', tenantId, staffAccountId: staffId, sessionVersion: 4 }
};
const auth = { verifyIdToken: async (token: string) => { if (!claims[token]) throw new Error('invalid'); return claims[token]; } } as any;
const shift = {
  id: 'shift-1', tenantId, moduleId: 'benta-snap', staffAccountId: staffId, staffId: `staff_${staffId}`, openedBy: `staff_${staffId}`,
  status: 'open', reconciliationVersion: 1, startingCash: 100_000, cashSales: 0, gcashSales: 0, mayaSales: 0,
  totalShiftSales: 0, electronicReceipts: 0, physicalCashAdjustments: 0, saleCount: 0,
  openedAt: new Date('2023-11-14T22:13:20.000Z')
};
const base = {
  [`tenants/${tenantId}`]: { name: '  Maria Store  ', moduleType: 'benta-snap', subscriptionStatus: 'active', ownerUid: 'owner-secret' },
  [`tenants/${tenantId}/staff_accounts/${staffId}`]: { tenantId, authUid: 'uid-1', sessionVersion: 4, status: 'active', username: 'maria', displayName: ' Maria ', pinHash: 'secret', activeShiftId: 'shift-1' },
  [`tenants/${tenantId}/shifts/shift-1`]: shift,
  [`tenants/${tenantId}/products/p1`]: { tenantId, isActive: true, name: 'Rice', unit: 'bag', salePrice: 12_500, costPrice: 9_000, currentStock: 5, minStock: 1, sku: 'R-1', barcode: '123', category: 'Grain', supplier: 'secret', internalNote: 'secret' },
  [`tenants/${tenantId}/products/inactive`]: { tenantId, isActive: false, name: 'Old', unit: 'pc', salePrice: 1, currentStock: 1 },
  [`tenants/${tenantId}/products/cross`]: { tenantId: 'tenant-other', isActive: true, name: 'Cross', unit: 'pc', salePrice: 1, currentStock: 1 },
  [`tenants/${tenantId}/products/mismatch`]: { id: 'different-id', tenantId, isActive: true, name: 'Mismatch', unit: 'pc', salePrice: 1, currentStock: 1 },
  [`tenants/${tenantId}/products/wrong-module`]: { tenantId, moduleId: 'build-stack', isActive: true, name: 'Wrong', unit: 'pc', salePrice: 1, currentStock: 1 }
};

async function main() {
  console.log('BENTA CASHIER BOOTSTRAP UNIT TESTS');
  const valid = memory(base); const response = await getBentaCashierBootstrap('valid', { adminAuth: auth, adminFirestore: valid.db });
  assert(response.tenantId === tenantId && response.tenantDisplayName === 'Maria Store' && response.staffAccountId === staffId && response.cashierDisplayName === 'Maria', 'valid custom-token Cashier receives authoritative safe identity context');
  assert(response.currentShift?.id === 'shift-1' && response.currentShift.status === 'open' && response.currentShift.startingCashCentavos === 100_000, 'valid secure active shift is recovered');
  assert(response.products.length === 1 && response.products[0].id === 'p1', 'only active same-tenant valid Benta product is returned');
  const serialized = JSON.stringify(response);
  assert(!serialized.includes('costPrice') && !serialized.includes('pinHash') && !serialized.includes('sessionVersion') && !serialized.includes('authUid') && !serialized.includes('owner-secret') && !serialized.includes('supplier') && !serialized.includes('internalNote'), 'bootstrap excludes credential, cost, owner, subscription and internal metadata');
  assert(Object.keys(response.products[0]).every((key) => ['id', 'name', 'sku', 'barcode', 'category', 'salePrice', 'currentStock', 'minStock', 'unit', 'isActive'].includes(key)), 'catalogue uses the strict response allowlist');

  const noShiftSeed: Record<string, any> = structuredClone(base); delete noShiftSeed[`tenants/${tenantId}/staff_accounts/${staffId}`].activeShiftId; delete noShiftSeed[`tenants/${tenantId}/shifts/shift-1`];
  assert((await getBentaCashierBootstrap('valid', { adminAuth: auth, adminFirestore: memory(noShiftSeed).db })).currentShift === null, 'consistent absence of an active shift returns null');

  const expectAssociatedOpenFailure = async (label: string, seeded: Record<string, any>) => {
    const state = memory(seeded); const before = JSON.stringify(state.store);
    await rejects(() => getBentaCashierBootstrap('valid', { adminAuth: auth, adminFirestore: state.db }), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, `${label} fails closed`);
    assert(JSON.stringify(state.store) === before, `${label} is mutation-free`);
  };
  await expectAssociatedOpenFailure('missing pointer with correct staffAccountId and corrupted staffId', {
    ...noShiftSeed,
    [`tenants/${tenantId}/shifts/orphan-account`]: { ...shift, id: 'orphan-account', staffId: 'staff_corrupted' }
  });
  await expectAssociatedOpenFailure('missing pointer with correct staffId and corrupted staffAccountId', {
    ...noShiftSeed,
    [`tenants/${tenantId}/shifts/orphan-actor`]: { ...shift, id: 'orphan-actor', staffAccountId: 'other-cashier' }
  });
  await expectAssociatedOpenFailure('valid pointer with second open shift for the same staffAccountId', {
    ...base,
    [`tenants/${tenantId}/shifts/duplicate-account`]: { ...shift, id: 'duplicate-account', staffId: 'staff_corrupted' }
  });
  await expectAssociatedOpenFailure('valid pointer with second open shift for the same staffId', {
    ...base,
    [`tenants/${tenantId}/shifts/duplicate-actor`]: { ...shift, id: 'duplicate-actor', staffAccountId: 'other-cashier' }
  });

  for (const [label, staffChange, shiftChange] of [
    ['malformed pointer', { activeShiftId: 'bad/value' }, null],
    ['dangling pointer', { activeShiftId: 'missing-shift' }, null],
    ['closed shift', { activeShiftId: 'shift-1' }, { status: 'closed' }],
    ['stored/path ID mismatch', { activeShiftId: 'shift-1' }, { id: 'different-id' }],
    ['wrong Cashier shift', { activeShiftId: 'shift-1' }, { staffAccountId: 'other', staffId: 'staff_other', openedBy: 'staff_other' }],
    ['cross-tenant shift', { activeShiftId: 'shift-1' }, { tenantId: 'tenant-other' }],
    ['wrong-module shift', { activeShiftId: 'shift-1' }, { moduleId: 'build-stack' }],
    ['invalid reconciliation version', { activeShiftId: 'shift-1' }, { reconciliationVersion: 2 }]
  ] as const) {
    const seeded = structuredClone(base); Object.assign(seeded[`tenants/${tenantId}/staff_accounts/${staffId}`], staffChange);
    if (shiftChange) Object.assign(seeded[`tenants/${tenantId}/shifts/shift-1`], shiftChange);
    const state = memory(seeded); const before = JSON.stringify(state.store);
    await rejects(() => getBentaCashierBootstrap('valid', { adminAuth: auth, adminFirestore: state.db }), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, `${label} fails closed with recovery-required`);
    assert(JSON.stringify(state.store) === before, `${label} is not repaired or mutated`);
  }
  const orphanSeed: Record<string, any> = structuredClone(noShiftSeed); orphanSeed[`tenants/${tenantId}/shifts/orphan`] = { ...shift, id: 'orphan' };
  await rejects(() => getBentaCashierBootstrap('valid', { adminAuth: auth, adminFirestore: memory(orphanSeed).db }), CheckoutErrorCode.SHIFT_RECOVERY_REQUIRED, 'unexpected open shift without pointer fails closed');

  const disabled = structuredClone(base); disabled[`tenants/${tenantId}/staff_accounts/${staffId}`].status = 'disabled';
  await rejects(() => getBentaCashierBootstrap('valid', { adminAuth: auth, adminFirestore: memory(disabled).db }), CheckoutErrorCode.SESSION_INVALID, 'disabled Cashier is rejected');
  await rejects(() => getBentaCashierBootstrap('stale', { adminAuth: auth, adminFirestore: memory(base).db }), CheckoutErrorCode.SESSION_INVALID, 'stale session is rejected');
  await rejects(() => getBentaCashierBootstrap('wrongTenant', { adminAuth: auth, adminFirestore: memory(base).db }), CheckoutErrorCode.OPERATION_NOT_PERMITTED, 'wrong tenant is rejected');
  await rejects(() => getBentaCashierBootstrap('wrongRole', { adminAuth: auth, adminFirestore: memory(base).db }), CheckoutErrorCode.OPERATION_NOT_PERMITTED, 'non-Cashier token is rejected');
  const wrongModule = structuredClone(base); wrongModule[`tenants/${tenantId}`].moduleType = 'build-stack';
  await rejects(() => getBentaCashierBootstrap('valid', { adminAuth: auth, adminFirestore: memory(wrongModule).db }), CheckoutErrorCode.CHECKOUT_UNAVAILABLE, 'wrong tenant module is rejected');
  const inactive = structuredClone(base); inactive[`tenants/${tenantId}`].subscriptionStatus = 'suspended';
  await rejects(() => getBentaCashierBootstrap('valid', { adminAuth: auth, adminFirestore: memory(inactive).db }), CheckoutErrorCode.CHECKOUT_UNAVAILABLE, 'inactive subscription is rejected');
  console.log(`RESULT ${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
