import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { shouldTriggerServerFinalization, SnapshotChange } from '../src/lib/client/hybrid-cash-checkout-manager';

function createMockChange(
  type: 'added' | 'removed' | 'modified',
  status: string,
  hasPendingWrites: boolean
): SnapshotChange {
  return {
    type,
    doc: {
      id: 'test_intent_id',
      data: () => ({
        status,
        schemaVersion: 2,
        intentId: 'test_intent_id',
        tenantId: 'tenant_1',
        authUid: 'cashier_1',
        staffAccountId: 'staff_1',
        shiftId: 'shift_1',
        tender: 'cash',
        items: [],
        itemCount: 0,
        offlineAuthorityDigest: 'digest_123',
        observedTotalCentavos: 10000,
        cashTenderedCentavos: 10000,
        changeRequiredCentavos: 0,
        clientCreatedAt: new Date().toISOString()
      }),
      metadata: {
        hasPendingWrites
      }
    }
  };
}

describe('Finalization Predicate Unit Tests', () => {
  it('removed + acknowledged pending → false', () => {
    const change = createMockChange('removed', 'pending', false);
    assert.equal(shouldTriggerServerFinalization(change, true), false);
  });

  it('added + acknowledged pending → true', () => {
    const change = createMockChange('added', 'pending', false);
    assert.equal(shouldTriggerServerFinalization(change, true), true);
  });

  it('modified + pending writes → false', () => {
    const change = createMockChange('modified', 'pending', true);
    assert.equal(shouldTriggerServerFinalization(change, true), false);
  });

  it('accepted status → false', () => {
    const change = createMockChange('added', 'accepted', false);
    assert.equal(shouldTriggerServerFinalization(change, true), false);
  });

  it('accepted_variance status → false', () => {
    const change = createMockChange('added', 'accepted_variance', false);
    assert.equal(shouldTriggerServerFinalization(change, true), false);
  });

  it('needs_review status → false', () => {
    const change = createMockChange('added', 'needs_review', false);
    assert.equal(shouldTriggerServerFinalization(change, true), false);
  });

  it('rejected_tampered status → false', () => {
    const change = createMockChange('added', 'rejected_tampered', false);
    assert.equal(shouldTriggerServerFinalization(change, true), false);
  });

  it('no idToken → false', () => {
    const change = createMockChange('added', 'pending', false);
    assert.equal(shouldTriggerServerFinalization(change, false), false);
  });

  it('modified + acknowledged pending + idToken → true', () => {
    const change = createMockChange('modified', 'pending', false);
    assert.equal(shouldTriggerServerFinalization(change, true), true);
  });
});