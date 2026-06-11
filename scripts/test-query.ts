import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, doc, getDoc, orderBy, limit } from 'firebase/firestore';
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
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  try {
    console.log('Logging in...');
    const cred = await signInWithEmailAndPassword(auth, 'demo@katuwangsolutions.com', 'katuwangdemo');
    const uid = cred.user.uid;
    console.log('Logged in as:', uid);

    console.log('\n--- Testing useUserTenants Owner Query ---');
    try {
      const q = query(collection(db, 'tenants'), where('ownerUid', '==', uid));
      const snap = await getDocs(q);
      console.log('SUCCESS! ownerTenants count:', snap.docs.length);
    } catch (e) {
      console.error('FAILED ownerTenants query:', e);
    }

    console.log('\n--- Testing useUserTenants Staff Query ---');
    try {
      const q2 = query(collection(db, 'tenants'), where('staffUids', 'array-contains', uid));
      const snap2 = await getDocs(q2);
      console.log('SUCCESS! staffTenants count:', snap2.docs.length);
    } catch (e) {
      console.error('FAILED staffTenants query:', e);
    }

    console.log('\n--- Testing AuthGuard Profile Query ---');
    try {
      const profile = await getDoc(doc(db, 'users', uid));
      console.log('SUCCESS! Profile exists:', profile.exists());
    } catch (e) {
      console.error('FAILED Profile query:', e);
    }

    const tId = `demo-benta-snap-${uid.substring(0, 5)}`;
    
    console.log('\n--- Testing useSyncStatus Query ---');
    try {
      const salesRef = collection(db, 'tenants', tId, 'transactions');
      const q3 = query(salesRef, orderBy('createdAt', 'desc'), limit(10));
      const snap3 = await getDocs(q3);
      console.log('SUCCESS! syncStatus transactions count:', snap3.docs.length);
    } catch (e) {
      console.error('FAILED syncStatus query:', e);
    }

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
