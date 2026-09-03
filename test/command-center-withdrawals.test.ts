import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWithdrawalDecisionRoute,
  decideReferralWithdrawal,
  WithdrawalDecisionErrorCode,
} from '../src/lib/server/command-center-withdrawals';

function buildState(seed: Record<string, Record<string, unknown>>, role = 'billing') {
  const store = new Map(Object.entries(seed).map(([path, value]) => [path, { ...value }]));
  const writes: Array<{ type: string; path: string }> = [];
  const ref = (path: string) => ({ path });
  const snapshot = (path: string) => ({
    exists: store.has(path),
    data: () => store.get(path),
  });
  const db = {
    doc: (path: string) => ({
      path,
      get: async () => snapshot(path),
    }),
    runTransaction: async (callback: (transaction: any) => Promise<unknown>) => callback({
      get: async (documentRef: { path: string }) => snapshot(documentRef.path),
      update: (documentRef: { path: string }, value: Record<string, unknown>) => {
        const current = store.get(documentRef.path);
        if (!current) throw new Error('missing document');
        store.set(documentRef.path, { ...current, ...value });
        writes.push({ type: 'update', path: documentRef.path });
      },
      set: (documentRef: { path: string }, value: Record<string, unknown>) => {
        store.set(documentRef.path, { ...value });
        writes.push({ type: 'set', path: documentRef.path });
      },
    }),
  };

  return {
    store,
    writes,
    dependencies: {
      adminAuth: {
        verifyIdToken: async () => ({
          uid: 'admin-1',
          email: 'billing@example.test',
          role,
        }),
      } as any,
      adminFirestore: db as any,
      now: () => ({ seconds: 1_700_000_000, nanoseconds: 0 } as any),
    },
    ref,
  };
}

function baseSeed(adminRole = 'billing') {
  return {
    'admins/admin-1': { role: adminRole },
    'referral_withdrawals/withdrawal-1': {
      uid: 'user-1',
      amountPesos: 250,
      status: 'pending',
    },
    'users/user-1': {
      availableBalance: 0,
      referralEarnings: 500,
    },
  };
}

test('Command Center withdrawal decisions', async (t) => {
  await t.test('rejection restores the authoritative user and amount exactly once', async () => {
    const state = buildState(baseSeed());
    const first = await decideReferralWithdrawal('valid', 'withdrawal-1', 'reject', state.dependencies);
    assert.deepEqual(first, { withdrawalId: 'withdrawal-1', status: 'rejected', replayed: false });
    assert.equal(state.store.get('users/user-1')?.availableBalance, 250);
    assert.equal(state.store.get('referral_withdrawals/withdrawal-1')?.status, 'rejected');
    assert.equal(state.store.has('admin_logs/withdrawal_withdrawal-1_reject'), true);

    const writeCount = state.writes.length;
    const replay = await decideReferralWithdrawal('valid', 'withdrawal-1', 'reject', state.dependencies);
    assert.deepEqual(replay, { withdrawalId: 'withdrawal-1', status: 'rejected', replayed: true });
    assert.equal(state.store.get('users/user-1')?.availableBalance, 250);
    assert.equal(state.writes.length, writeCount, 'Replay performs no additional writes or refund');
  });

  await t.test('mark-paid is a guarded pending-to-paid transition', async () => {
    const state = buildState(baseSeed());
    const result = await decideReferralWithdrawal('valid', 'withdrawal-1', 'mark_paid', state.dependencies);
    assert.deepEqual(result, { withdrawalId: 'withdrawal-1', status: 'paid', replayed: false });
    assert.equal(state.store.get('referral_withdrawals/withdrawal-1')?.processedByUid, 'admin-1');
    assert.equal(state.store.get('users/user-1')?.availableBalance, 0);

    const replay = await decideReferralWithdrawal('valid', 'withdrawal-1', 'mark_paid', state.dependencies);
    assert.equal(replay.replayed, true);
  });

  await t.test('opposite decisions cannot overwrite a terminal state', async () => {
    const state = buildState(baseSeed());
    await decideReferralWithdrawal('valid', 'withdrawal-1', 'mark_paid', state.dependencies);
    await assert.rejects(
      () => decideReferralWithdrawal('valid', 'withdrawal-1', 'reject', state.dependencies),
      (error: any) => error?.code === WithdrawalDecisionErrorCode.STATE_CONFLICT,
    );
    assert.equal(state.store.get('users/user-1')?.availableBalance, 0);
  });

  await t.test('support role is denied financial mutation', async () => {
    const state = buildState(baseSeed('support'), 'support');
    await assert.rejects(
      () => decideReferralWithdrawal('valid', 'withdrawal-1', 'mark_paid', state.dependencies),
      (error: any) => error?.httpStatus === 403,
    );
    assert.equal(state.writes.length, 0);
  });

  await t.test('malformed stored money fails closed without mutation', async () => {
    const seed = baseSeed();
    seed['referral_withdrawals/withdrawal-1'].amountPesos = -250;
    const state = buildState(seed);
    await assert.rejects(
      () => decideReferralWithdrawal('valid', 'withdrawal-1', 'reject', state.dependencies),
      (error: any) => error?.code === WithdrawalDecisionErrorCode.DATA_INTEGRITY_ERROR,
    );
    assert.equal(state.writes.length, 0);
    assert.equal(state.store.get('users/user-1')?.availableBalance, 0);
  });

  await t.test('route rejects extra browser-supplied financial fields', async () => {
    const state = buildState(baseSeed());
    const route = createWithdrawalDecisionRoute(state.dependencies);
    const response = await route(new Request('https://example.test/decision', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'reject', uid: 'attacker-selected-user', amountPesos: 999999 }),
    }), 'withdrawal-1');
    assert.equal(response.status, 400);
    assert.equal((await response.json()).category, WithdrawalDecisionErrorCode.INVALID_REQUEST);
    assert.equal(state.writes.length, 0);
  });
});
