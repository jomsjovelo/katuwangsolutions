import * as admin from 'firebase-admin';
import crypto from 'crypto';

const PROJECT_ID = 'demo-katuwang-offline-test';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = PROJECT_ID;

// The rate limiter uses NO hmacSecret when created with default constructor
// so getRateLimitHmacSecret() reads from RATE_LIMIT_HMAC_SECRET env var
// But for the start-prod-server.ps1, no RATE_LIMIT_HMAC_SECRET is set,
// so the rate limiter will throw "Missing or invalid RATE_LIMIT_HMAC_SECRET" 
// when it tries to hash keys -- which means it fails closed and returns 429.

// Let's just delete ALL documents in the throttle collection.
const appName = 'clear-all-throttles';
const app = admin.apps.find(a => a?.name === appName) || admin.initializeApp({ projectId: PROJECT_ID }, appName);
const db = app.firestore();

async function main() {
  const THROTTLE_COLLECTION = '_security_staff_auth_throttles';
  const col = db.collection(THROTTLE_COLLECTION);
  const snap = await col.get();
  console.log(`Found ${snap.size} throttle document(s)`);
  if (snap.size > 0) {
    snap.forEach(d => console.log('  -', d.id));
    const batch = db.batch();
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log('Cleared all throttle documents.');
  } else {
    console.log('No throttle documents found in emulator.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
