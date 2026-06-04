import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
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
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// The UID that was created
const UID = '8p9AUZejVSOsQshW2X5GTd661fS2';
const TENANT_ID = `demo-store-${UID.substring(0, 5)}`;

async function verify() {
  console.log(`\n🔍 Verifying Demo Account Data in Firestore...\n`);

  try {
    // Authenticate first!
    await signInWithEmailAndPassword(auth, 'demo@katuwangsolutions.com', 'katuwangdemo');
    console.log(`✅ Authenticated as Demo User.`);
    const userSnap = await getDoc(doc(db, 'users', UID));
    if (userSnap.exists()) {
      console.log(`✅ User Profile Found: ${userSnap.data().email} (Tenant: ${userSnap.data().tenantId})`);
    } else {
      console.log(`❌ User Profile Missing`);
    }

    const q = query(collection(db, 'tenants'), where('ownerUid', '==', UID));
    const querySnapshot = await getDocs(q);
    
    console.log(`✅ Found ${querySnapshot.size} total active Apps/Tenants for the demo account!`);
    
    querySnapshot.forEach((doc) => {
      console.log(`   - ${doc.data().name} (${doc.data().moduleType})`);
    });

    if (querySnapshot.size === 17) {
      console.log(`\n🎉 Verification Complete! All 17 apps are correctly seeded and ready for the App Switcher.\n`);
    } else {
      console.log(`\n⚠️ Warning: Expected 17 apps, but found ${querySnapshot.size}.\n`);
    }
    process.exit(0);
  } catch (e) {
    console.error(`❌ Verification failed:`, e);
    process.exit(1);
  }
}

verify();
