/**
 * Reusable in-memory IndexedDB Mock Factory for Order Snap tests
 */

export function createMockIndexedDB() {
  const dbs: Record<string, { version: number; stores: Record<string, Record<string, any>> }> = {};

  return {
    open: (name: string, version?: number) => {
      const req: any = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };

      setTimeout(() => {
        let dbRecord = dbs[name];
        const oldVersion = dbRecord ? dbRecord.version : 0;
        const targetVersion = version || 1;

        if (!dbRecord) {
          dbRecord = { version: targetVersion, stores: {} };
          dbs[name] = dbRecord;
        }

        const mockDb: any = {
          name,
          version: targetVersion,
          objectStoreNames: {
            contains: (sName: string) => !!dbRecord.stores[sName]
          },
          createObjectStore: (sName: string, opts?: any) => {
            if (!dbRecord.stores[sName]) {
              dbRecord.stores[sName] = {};
            }
            return {
              createIndex: (idxName: string, keyPath: any, idxOpts?: any) => {}
            };
          },
          transaction: (storeNames: string[], mode: string) => {
            let pendingOps = 0;
            const tx: any = {
              error: null,
              oncomplete: null,
              onerror: null,
              abort: () => {
                if (tx.onerror) tx.onerror();
              },
              _checkComplete: () => {
                if (pendingOps === 0) {
                  setTimeout(() => {
                    if (pendingOps === 0 && tx.oncomplete) {
                      tx.oncomplete();
                    }
                  }, 2);
                }
              },
              objectStore: (sName: string) => {
                const currentStore = dbRecord.stores[sName] || {};
                dbRecord.stores[sName] = currentStore;

                const getKey = (val: any) => {
                  if (sName === 'order_outbox') {
                    return `${val.tenantId}:${val.orderId}`;
                  }
                  if (sName === 'projected_reservations') {
                    return val.reservationId;
                  }
                  if (sName === 'offline_catalog' || sName === 'sync_leases') {
                    return val.tenantId;
                  }
                  if (sName === 'meta_state') {
                    return val.key;
                  }
                  if (sName === 'authority_grants') {
                    return `${val.tenantId}:${val.staffAccountId}:${val.deviceId}`;
                  }
                  return typeof val === 'object' ? JSON.stringify(val) : String(val);
                };

                return {
                  add: (val: any) => {
                    pendingOps++;
                    const key = getKey(val);
                    if (currentStore[key]) {
                      const err = new Error('Key already exists');
                      tx.error = err;
                      setTimeout(() => {
                        pendingOps--;
                        if (tx.onerror) tx.onerror();
                      }, 0);
                      return;
                    }
                    currentStore[key] = JSON.parse(JSON.stringify(val));
                    setTimeout(() => {
                      pendingOps--;
                      tx._checkComplete();
                    }, 0);
                  },
                  put: (val: any) => {
                    pendingOps++;
                    const key = getKey(val);
                    currentStore[key] = JSON.parse(JSON.stringify(val));
                    setTimeout(() => {
                      pendingOps--;
                      tx._checkComplete();
                    }, 0);
                  },
                  get: (k: any) => {
                    pendingOps++;
                    const key = Array.isArray(k) ? k.join(':') : String(k);
                    const reqGet: any = {
                      result: currentStore[key] ? JSON.parse(JSON.stringify(currentStore[key])) : undefined,
                      onsuccess: null,
                      onerror: null
                    };
                    setTimeout(() => {
                      if (reqGet.onsuccess) reqGet.onsuccess();
                      pendingOps--;
                      tx._checkComplete();
                    }, 0);
                    return reqGet;
                  },
                  getAll: () => {
                    pendingOps++;
                    const reqGetAll: any = {
                      result: Object.values(currentStore).map((v) => JSON.parse(JSON.stringify(v))),
                      onsuccess: null,
                      onerror: null
                    };
                    setTimeout(() => {
                      if (reqGetAll.onsuccess) reqGetAll.onsuccess();
                      pendingOps--;
                      tx._checkComplete();
                    }, 0);
                    return reqGetAll;
                  },
                  delete: (k: any) => {
                    pendingOps++;
                    const key = Array.isArray(k) ? k.join(':') : String(k);
                    delete currentStore[key];
                    setTimeout(() => {
                      pendingOps--;
                      tx._checkComplete();
                    }, 0);
                  },
                  index: (idxName: string) => ({
                    getAll: (queryKey: any) => {
                      pendingOps++;
                      const reqIdx: any = {
                        result: Object.values(currentStore)
                          .filter((item: any) => {
                            if (Array.isArray(queryKey)) {
                              if (idxName === 'by_tenant_order') {
                                return item.tenantId === queryKey[0] && item.orderId === queryKey[1];
                              }
                              if (idxName === 'by_tenant_ingredient') {
                                return item.tenantId === queryKey[0] && item.ingredientId === queryKey[1];
                              }
                            }
                            return true;
                          })
                          .map((v) => JSON.parse(JSON.stringify(v))),
                        onsuccess: null,
                        onerror: null
                      };
                      setTimeout(() => {
                        if (reqIdx.onsuccess) reqIdx.onsuccess();
                        pendingOps--;
                        tx._checkComplete();
                      }, 0);
                      return reqIdx;
                    }
                  })
                };
              }
            };
            return tx;
          }
        };

        req.result = mockDb;

        if (oldVersion < targetVersion) {
          if (req.onupgradeneeded) {
            req.onupgradeneeded({ oldVersion, newVersion: targetVersion, target: req });
          }
        }

        dbRecord.version = targetVersion;

        if (req.onsuccess) {
          req.onsuccess();
        }
      }, 0);

      return req;
    }
  } as unknown as IDBFactory;
}
