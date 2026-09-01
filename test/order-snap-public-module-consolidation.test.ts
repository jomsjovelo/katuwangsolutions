import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeModules,
  activeModulesCount,
  businessModules,
  standardModulesCount,
  normalizeModuleId,
  isValidActiveModuleId,
  getActiveAppById,
} from '../src/lib/app-data';

test('Order Snap Public Module Consolidation Suite', async (t) => {
  await t.test('1. Canonical public module counts', () => {
    assert.equal(activeModulesCount, 17, 'Expected exactly 17 active modules');
    assert.equal(activeModules.length, 17, 'Expected activeModules array length to be 17');
    assert.equal(standardModulesCount, 16, 'Expected 16 standard business modules');
    assert.equal(businessModules.length, 16, 'Expected businessModules array length to be 16');
  });

  await t.test('2. Exactly one F&B Order Snap card; no separate legacy cards', () => {
    const orderSnapEntries = activeModules.filter((m) => m.id === 'order-snap');
    assert.equal(orderSnapEntries.length, 1, 'Expected exactly one order-snap active module');

    const biteEntries = activeModules.filter((m) => m.id === 'bite-snap');
    assert.equal(biteEntries.length, 0, 'No active public module should have id bite-snap');

    const timplaEntries = activeModules.filter((m) => m.id === 'timpla-track');
    assert.equal(timplaEntries.length, 0, 'No active public module should have id timpla-track');

    const uniqueIds = new Set(activeModules.map((m) => m.id));
    assert.equal(uniqueIds.size, activeModules.length, 'No duplicate IDs in activeModules');
  });

  await t.test('3. Normalization maps all three IDs to canonical order-snap', () => {
    assert.equal(normalizeModuleId('order-snap'), 'order-snap');
    assert.equal(normalizeModuleId('bite-snap'), 'order-snap', 'bite-snap must normalize to order-snap');
    assert.equal(normalizeModuleId('timpla-track'), 'order-snap', 'timpla-track must normalize to order-snap');
    assert.equal(normalizeModuleId('ORDER-SNAP'), 'order-snap', 'Case-insensitive normalization');
    assert.equal(normalizeModuleId('BITE-SNAP'), 'order-snap');
    assert.equal(normalizeModuleId('TIMPLA-TRACK'), 'order-snap');
  });

  await t.test('4. getActiveAppById resolves all three IDs to the same Order Snap module', () => {
    const byCanonical = getActiveAppById('order-snap');
    const byBite = getActiveAppById('bite-snap');
    const byTimpla = getActiveAppById('timpla-track');

    assert.ok(byCanonical, 'order-snap must resolve to a module');
    assert.ok(byBite, 'bite-snap must resolve to a module');
    assert.ok(byTimpla, 'timpla-track must resolve to a module');

    assert.equal(byCanonical, byBite, 'bite-snap must resolve to the same Order Snap instance');
    assert.equal(byCanonical, byTimpla, 'timpla-track must resolve to the same Order Snap instance');

    assert.equal(byCanonical?.id, 'order-snap');
    assert.equal(byCanonical?.name, 'Order Snap');
  });

  await t.test('5. isValidActiveModuleId accepts legacy compatibility IDs', () => {
    assert.equal(isValidActiveModuleId('order-snap'), true);
    assert.equal(isValidActiveModuleId('bite-snap'), true, 'Legacy bite-snap must remain a valid active module id');
    assert.equal(isValidActiveModuleId('timpla-track'), true, 'Legacy timpla-track must remain a valid active module id');
  });

  await t.test('6. Order Snap target users cover both restaurant and café use cases', () => {
    const orderSnap = getActiveAppById('order-snap');
    assert.ok(orderSnap, 'Order Snap must be present');
    assert.ok(orderSnap?.targetUsers && orderSnap.targetUsers.length > 0, 'Order Snap must declare target users');

    const lowerUsers = orderSnap!.targetUsers!.map((u) => u.toLowerCase());
    assert.ok(lowerUsers.includes('restaurants'), 'Target users must cover restaurant use case');
    assert.ok(
      lowerUsers.includes('cafés') || lowerUsers.includes('coffee shops'),
      'Target users must cover café use case'
    );
  });

  await t.test('7. Order Snap description covers required capabilities', () => {
    const orderSnap = getActiveAppById('order-snap');
    const desc = (orderSnap?.description || '').toLowerCase();
    const required = ['pos', 'orders', 'tables', 'kitchen', 'recipes', 'inventory', 'cashier', 'offline', 'synchronization'];
    required.forEach((term) => {
      assert.ok(desc.includes(term), `Order Snap description must mention "${term}"`);
    });
  });

  await t.test('8. Budget Mo and Ganap Master remain present (Food & Events category intact)', () => {
    const budgetMo = getActiveAppById('budget-mo');
    assert.ok(budgetMo, 'Budget Mo must remain present');
    assert.equal(budgetMo?.id, 'budget-mo');
    assert.ok(activeModules.some((m) => m.id === 'budget-mo'), 'Budget Mo must be in activeModules');

    const ganap = getActiveAppById('ganap-master');
    assert.ok(ganap, 'Ganap Master must remain present');
    assert.equal(ganap?.id, 'ganap-master');
    assert.ok(activeModules.some((m) => m.id === 'ganap-master'), 'Ganap Master must be in activeModules');
  });

  await t.test('9. No unrelated module was removed', () => {
    const expectedIds = [
      'benta-snap',
      'order-snap',
      'ganap-master',
      'spin-snap',
      'hydro-sync',
      'auto-boss',
      'wellness-pro',
      'trim-track',
      'rep-sync',
      'service-master',
      'biyahe-sync',
      'rental',
      'sahod-flow',
      'ledger-flow',
      '5-6-tracker',
      'tsek-in',
      'budget-mo',
    ];
    const activeIds = new Set(activeModules.map((m) => m.id));
    expectedIds.forEach((id) => {
      assert.ok(activeIds.has(id), `Unrelated module "${id}" must still be present`);
    });
    assert.equal(activeIds.size, expectedIds.length, 'No extra or missing modules beyond the expected 17');
  });
});
