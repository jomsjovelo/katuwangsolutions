import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, doc, getDoc, orderBy } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function testQuery() {
  try {
    console.log("Logging in...");
    const cred = await signInWithEmailAndPassword(auth, 'demo@katuwangsolutions.com', 'katuwangdemo');
    const uid = cred.user.uid;
    console.log("Logged in as:", uid);

    // Find the primary tenant
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    const tenantId = userSnap.data()?.tenantId;
    console.log("Tenant ID:", tenantId);

    // Try reading tenant doc
    console.log("Reading tenant doc...");
    const tenantRef = doc(db, 'tenants', tenantId);
    const tenantSnap = await getDoc(tenantRef);
    console.log("Tenant data:", tenantSnap.data());

    // Try reading transactions
    console.log("Reading transactions...");
    const txRef = collection(db, 'tenants', tenantId, 'transactions');
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - 1);
    const rangeEnd = new Date();
    const q = query(
      txRef,
      where('createdAt', '>=', rangeStart),
      where('createdAt', '<=', rangeEnd),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    console.log("Transactions count:", snap.size);

  } catch (err: any) {
    console.error("ERROR:");
    console.error(err.code, err.message);
  }
  process.exit();
}

testQuery();
