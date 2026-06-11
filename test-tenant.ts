
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  const cred = await signInWithEmailAndPassword(auth, 'demo@katuwangsolutions.com', 'katuwangdemo');
  const uid = cred.user.uid;
  
  const userSnap = await getDoc(doc(db, 'users', uid));
  const tenantId = userSnap.data().tenantId;
  console.log('User Tenant ID:', tenantId);
  
  const tenantSnap = await getDoc(doc(db, 'tenants', tenantId));
  console.log('Tenant Exists?', tenantSnap.exists());
  if (tenantSnap.exists()) {
     console.log('Tenant Data:', tenantSnap.data());
  } else {
     console.log('TENANT IS MISSING IN FIRESTORE!');
  }
  process.exit(0);
}
run();

