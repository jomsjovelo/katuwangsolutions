import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, orderBy, Timestamp, onSnapshot } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import path from 'path';

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
    const cred = await signInWithEmailAndPassword(auth, 'demo@katuwangsolutions.com', 'katuwangdemo');
    const uid = cred.user.uid;
    const tId = `demo-benta-snap-${uid.substring(0, 5)}`;
    const txRef = collection(db, 'tenants', tId, 'transactions');

    const rangeStart = new Date(new Date().setHours(0,0,0,0));
    const rangeEnd = new Date(new Date().setHours(23,59,59,999));

    console.log('Testing Range Query (JS Date)...');
    try {
      const q = query(txRef, where('createdAt', '>=', rangeStart), where('createdAt', '<=', rangeEnd), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      console.log('JS Date Query SUCCESS');
    } catch (e: any) {
      console.error('JS Date Query FAILED:', e.message);
    }

    console.log('Testing Range Query (Timestamp)...');
    try {
      const q = query(txRef, where('createdAt', '>=', Timestamp.fromDate(rangeStart)), where('createdAt', '<=', Timestamp.fromDate(rangeEnd)), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      console.log('Timestamp Query SUCCESS');
    } catch (e: any) {
      console.error('Timestamp Query FAILED:', e.message);
    }
    
    // Test without orderby
    console.log('Testing Range Query Without OrderBy...');
    try {
      const q = query(txRef, where('createdAt', '>=', rangeStart), where('createdAt', '<=', rangeEnd));
      const snap = await getDocs(q);
      console.log('No OrderBy Query SUCCESS');
    } catch (e: any) {
      console.error('No OrderBy Query FAILED:', e.message);
    }

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
