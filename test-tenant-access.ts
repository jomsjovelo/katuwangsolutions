
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import { firebaseConfig } from './src/firebase/config';
dotenv.config();

async function run() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  
  await signInWithEmailAndPassword(auth, 'demo@katuwangsolutions.com', 'password123');
  const uid = auth.currentUser?.uid;
  console.log('Logged in UID:', uid);
  
  const userSnap = await getDoc(doc(db, 'users', uid as string));
  const userData = userSnap.data() as any;
  console.log('User Data tenantId:', userData?.tenantId);
  
  const tenantSnap = await getDoc(doc(db, 'tenants', userData.tenantId));
  if (tenantSnap.exists()) {
    console.log('Tenant exists!');
    console.log('Tenant ownerUid:', tenantSnap.data().ownerUid);
    console.log('Tenant staffUids:', tenantSnap.data().staffUids);
  } else {
    console.log('Tenant DOES NOT EXIST!');
  }
  
  try {
    console.log('Testing subcollection access...');
    await getDocs(collection(db, 'tenants', userData.tenantId, 'transactions'));
    console.log('Access GRANTED to transactions!');
  } catch (e: any) {
    console.error('Access DENIED to transactions:', e.code);
  }
  
  process.exit(0);
}
run();

