import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-katuwang-offline-test' });
}

const db = admin.firestore();
const TENANT_ID = 'demo-benta-store';

export async function repairEmulatorAccounts(tenantId: string = TENANT_ID): Promise<{
  repairedCount: number;
  gcashTotalCentavos: number;
  mayaTotalCentavos: number;
  priorMasterCashCentavos: number;
  newMasterCashCentavos: number;
}> {
  const tenantRef = db.collection('tenants').doc(tenantId);
  const masterCashRef = tenantRef.collection('accounts').doc('master-cash');
  const gcashAccRef = tenantRef.collection('accounts').doc('gcash-settlement');
  const mayaAccRef = tenantRef.collection('accounts').doc('maya-settlement');

  // Read transactions collection outside transaction
  const txsSnap = await tenantRef.collection('transactions').get();

  let gcashCorrectionCentavos = 0;
  let mayaCorrectionCentavos = 0;
  let repairedCount = 0;
  const txUpdates: Array<{ ref: admin.firestore.DocumentReference; targetAccountId?: string; newDescription?: string }> = [];

  txsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const paymentMethod = data.paymentMethod || '';
    const accountId = data.accountId || '';
    const amount = data.amount || 0;
    const description = data.description || '';

    let targetAccountId: string | undefined;
    let newDescription: string | undefined;

    // Find transactions that are cashless (gcash/maya) but still assigned to master-cash
    if (accountId === 'master-cash') {
      if (paymentMethod === 'gcash') {
        gcashCorrectionCentavos += amount;
        targetAccountId = 'gcash-settlement';
        repairedCount++;
      } else if (paymentMethod === 'maya') {
        mayaCorrectionCentavos += amount;
        targetAccountId = 'maya-settlement';
        repairedCount++;
      }
    }

    // Normalize any internal terminology in descriptions
    if (description.includes('Hybrid intent') || description.includes('offline intent') || description.toLowerCase().includes('cashier sale')) {
      newDescription = 'Benta Snap Cashier Sale';
    }

    if (targetAccountId || newDescription) {
      txUpdates.push({ ref: docSnap.ref, targetAccountId, newDescription });
    }
  });

  const totalMisclassifiedCentavos = gcashCorrectionCentavos + mayaCorrectionCentavos;

  return await db.runTransaction(async (transaction) => {
    const masterSnap = await transaction.get(masterCashRef);
    const gcashSnap = await transaction.get(gcashAccRef);
    const mayaSnap = await transaction.get(mayaAccRef);

    const priorMasterCashCentavos = masterSnap.exists ? (masterSnap.data()?.balance || 0) : 0;
    const oldGcash = gcashSnap.exists ? (gcashSnap.data()?.balance || 0) : 0;
    const oldMaya = mayaSnap.exists ? (mayaSnap.data()?.balance || 0) : 0;

    const newMasterCashCentavos = priorMasterCashCentavos - totalMisclassifiedCentavos;

    // Apply transaction updates
    for (const update of txUpdates) {
      const updateData: Record<string, any> = {
        updatedAt: admin.firestore.Timestamp.now()
      };
      if (update.targetAccountId) {
        updateData.accountId = update.targetAccountId;
      }
      if (update.newDescription) {
        updateData.description = update.newDescription;
      }
      transaction.update(update.ref, updateData);
    }

    // Update master-cash if there were misclassified funds
    if (totalMisclassifiedCentavos > 0) {
      transaction.set(masterCashRef, {
        balance: newMasterCashCentavos,
        updatedAt: admin.firestore.Timestamp.now()
      }, { merge: true });
    }

    // Update or initialize gcash-settlement account
    if (gcashCorrectionCentavos > 0) {
      transaction.set(gcashAccRef, {
        id: 'gcash-settlement',
        tenantId,
        name: 'GCash Settlement',
        type: 'asset',
        balance: oldGcash + gcashCorrectionCentavos,
        isActive: true,
        updatedAt: admin.firestore.Timestamp.now()
      }, { merge: true });
    }

    // Update or initialize maya-settlement account
    if (mayaCorrectionCentavos > 0) {
      transaction.set(mayaAccRef, {
        id: 'maya-settlement',
        tenantId,
        name: 'Maya Settlement',
        type: 'asset',
        balance: oldMaya + mayaCorrectionCentavos,
        isActive: true,
        updatedAt: admin.firestore.Timestamp.now()
      }, { merge: true });
    }

    return {
      repairedCount,
      gcashTotalCentavos: gcashCorrectionCentavos,
      mayaTotalCentavos: mayaCorrectionCentavos,
      priorMasterCashCentavos,
      newMasterCashCentavos
    };
  });
}

// Run directly if invoked from CLI
if (require.main === module) {
  repairEmulatorAccounts()
    .then((result) => {
      console.log('Account repair completed successfully:');
      console.log(`- Transactions reclassified: ${result.repairedCount}`);
      console.log(`- GCash reclassified: ₱${(result.gcashTotalCentavos / 100).toFixed(2)}`);
      console.log(`- Maya reclassified: ₱${(result.mayaTotalCentavos / 100).toFixed(2)}`);
      console.log(`- Master Cash before: ₱${(result.priorMasterCashCentavos / 100).toFixed(2)}`);
      console.log(`- Master Cash after: ₱${(result.newMasterCashCentavos / 100).toFixed(2)}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Account repair failed:', err);
      process.exit(1);
    });
}
