import test from 'node:test';
import assert from 'node:assert/strict';
import { JournalDB } from '../src/lib/offline/journal-db';

test('JournalDB handles storage, scoped state transitions, parameter validation, and summary with mock IndexedDB', async () => {
  const store: Record<string, Record<string, any>> = {
    journal_entries: {},
    grants: {},
    catalog_cache: {},
    meta_state: {}
  };

  const mockDb: any = {
    transaction: (stores: string[], mode: string) => {
      const tx: any = {
        oncomplete: null,
        onerror: null,
        objectStore: (storeName: string) => ({
          put: (val: any) => {
            const key = val.entryId || val.key || val.snapshotKey || val.payload?.grantId;
            store[storeName][key] = val;
            const req: any = { onsuccess: null, onerror: null };
            setTimeout(() => {
              if (req.onsuccess) req.onsuccess();
              if (tx.oncomplete) tx.oncomplete();
            }, 0);
            return req;
          },
          get: (key: string) => {
            const req: any = { result: store[storeName][key], onsuccess: null, onerror: null };
            setTimeout(() => {
              if (req.onsuccess) req.onsuccess();
            }, 0);
            return req;
          },
          getAll: () => {
            const req: any = { result: Object.values(store[storeName]), onsuccess: null, onerror: null };
            setTimeout(() => {
              if (req.onsuccess) req.onsuccess();
            }, 0);
            return req;
          },
          index: (indexName: string) => ({
            getAll: (queryKey: any) => {
              const req: any = {
                result: Object.values(store[storeName]).filter((item: any) => {
                  if (Array.isArray(queryKey)) {
                    if (storeName === 'grants') {
                      return item.payload?.tenantId === queryKey[0] &&
                             item.payload?.staffAccountId === queryKey[1] &&
                             item.payload?.shiftId === queryKey[2];
                    }
                    return item.tenantId === queryKey[0] &&
                           item.staffAccountId === queryKey[1] &&
                           item.shiftId === queryKey[2];
                  }
                  return item.payload?.shiftId === queryKey || item.shiftId === queryKey;
                }),
                onsuccess: null,
                onerror: null
              };
              setTimeout(() => {
                if (req.onsuccess) req.onsuccess();
              }, 0);
              return req;
            }
          })
        })
      };
      return tx;
    }
  };

  const journal = new JournalDB();
  (journal as any).dbPromise = Promise.resolve(mockDb);

  const tenantId = 'tenant-1';
  const staffAccountId = 'staff-1';
  const shiftId = 'shift-1';

  // 1. Parameter validation failure on duplicate product line
  await assert.rejects(
    () => journal.appendJournalEntry({
      tenantId,
      staffAccountId,
      shiftId,
      grantId: 'grant-1',
      snapshotId: 'snap-1',
      idempotencyKey: 'idem-dup',
      clientTimestamp: new Date().toISOString(),
      items: [
        { productId: 'p1', name: 'Item 1', quantity: 1, unitPriceCentavos: 1000, lineTotalCentavos: 1000 },
        { productId: 'p1', name: 'Item 1 Duplicate', quantity: 2, unitPriceCentavos: 1000, lineTotalCentavos: 2000 }
      ],
      subtotalCentavos: 3000,
      totalCentavos: 3000,
      cashTenderedCentavos: 3000,
      changeCentavos: 0
    }),
    /duplicate_or_invalid_product_line/
  );

  // 2. Parameter validation failure on insufficient tender
  await assert.rejects(
    () => journal.appendJournalEntry({
      tenantId,
      staffAccountId,
      shiftId,
      grantId: 'grant-1',
      snapshotId: 'snap-1',
      idempotencyKey: 'idem-tender',
      clientTimestamp: new Date().toISOString(),
      items: [
        { productId: 'p1', name: 'Item 1', quantity: 1, unitPriceCentavos: 1000, lineTotalCentavos: 1000 }
      ],
      subtotalCentavos: 1000,
      totalCentavos: 1000,
      cashTenderedCentavos: 500, // Tender < total!
      changeCentavos: 0
    }),
    /invalid_centavos_amount_or_insufficient_tender/
  );

  // 3. Append valid entry 1
  const entry1 = await journal.appendJournalEntry({
    tenantId,
    staffAccountId,
    shiftId,
    grantId: 'grant-1',
    snapshotId: 'snap-1',
    idempotencyKey: 'idem-1',
    clientTimestamp: new Date().toISOString(),
    items: [
      { productId: 'p1', name: 'Item 1', quantity: 2, unitPriceCentavos: 1000, lineTotalCentavos: 2000 }
    ],
    subtotalCentavos: 2000,
    totalCentavos: 2000,
    cashTenderedCentavos: 2000,
    changeCentavos: 0
  });

  assert.equal(entry1.seqIndex, 1);
  assert.equal(entry1.status, 'pending_sync');
  assert.equal(entry1.provisionalReceiptNumber, 'PROV-FT-1-1');
  assert.ok(entry1.entryId.length >= 16); // UUID

  // 4. Append valid entry 2
  const entry2 = await journal.appendJournalEntry({
    tenantId,
    staffAccountId,
    shiftId,
    grantId: 'grant-1',
    snapshotId: 'snap-1',
    idempotencyKey: 'idem-2',
    clientTimestamp: new Date().toISOString(),
    items: [
      { productId: 'p2', name: 'Item 2', quantity: 1, unitPriceCentavos: 3000, lineTotalCentavos: 3000 }
    ],
    subtotalCentavos: 3000,
    totalCentavos: 3000,
    cashTenderedCentavos: 5000,
    changeCentavos: 2000
  });

  assert.equal(entry2.seqIndex, 2);
  assert.equal(entry2.provisionalReceiptNumber, 'PROV-FT-1-2');

  // 5. Query pending entries scoped by tenant + staff + shift
  const pending = await journal.getPendingEntries(tenantId, staffAccountId, shiftId);
  assert.equal(pending.length, 2);

  // Different shift query returns empty
  const otherShiftPending = await journal.getPendingEntries(tenantId, staffAccountId, 'other-shift');
  assert.equal(otherShiftPending.length, 0);

  // 6. Update status to accepted
  await journal.updateEntryStatus(entry1.entryId, 'accepted', { serverSaleId: 'sale-1' });

  // 7. Reject invalid transition (accepted -> in_flight)
  await assert.rejects(
    () => journal.updateEntryStatus(entry1.entryId, 'in_flight'),
    /invalid_status_transition/
  );

  // 8. Shift summary scoped by tenant + staff + shift
  const summary = await journal.getShiftJournalSummary(tenantId, staffAccountId, shiftId);
  assert.equal(summary.confirmedSalesCount, 1);
  assert.equal(summary.confirmedCashCentavos, 2000);
  assert.equal(summary.pendingSalesCount, 1);
  assert.equal(summary.pendingCashCentavos, 3000);
});
