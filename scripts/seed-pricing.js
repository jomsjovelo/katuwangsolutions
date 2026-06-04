const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./firebase-service-account.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  await db.collection('system').doc('appStoreConfig').set({
    defaultAppPrice: 99,
    promotions: {}
  }, { merge: true });
  console.log("Successfully seeded dynamic pricing config to 99 pesos!");
  process.exit(0);
}

run().catch(console.error);
