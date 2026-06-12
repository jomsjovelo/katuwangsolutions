
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, getDoc, collection, getDocs } = require('firebase/firestore');
const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

async function run() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  
  await signInWithEmailAndPassword(auth, 'demo@katuwangsolutions.com', 'password123');
  const uid = auth.currentUser.uid;
  console.log('Logged in UID:', uid);
  
  const userSnap = await getDoc(doc(db, 'users', uid));
  const userData = userSnap.data();
  console.log('User Data tenantId:', userData.tenantId);
  
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
  } catch (e) {
    console.error('Access DENIED to transactions:', e.code);
  }
  
  process.exit(0);
}
run();

