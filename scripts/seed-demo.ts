import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, serverTimestamp, writeBatch } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
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

const DEMO_EMAIL = 'demo@katuwangsolutions.com';
const DEMO_PASSWORD = 'katuwangdemo';

async function seedDemoAccount() {
  console.log(`🚀 Starting Demo Seeder...`);
  let uid = '';

  try {
    console.log(`🔐 Creating or logging into Demo User (${DEMO_EMAIL})...`);
    try {
      const cred = await createUserWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
      uid = cred.user.uid;
      console.log(`✅ Created new user with UID: ${uid}`);
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
        uid = cred.user.uid;
        console.log(`✅ Logged into existing user with UID: ${uid}`);
      } else {
        throw e;
      }
    }

    const modules = [
      { id: 'benta-snap', name: 'Katuwang Benta Demo' },
      { id: 'fresh-tally', name: 'Katuwang Fresh Demo' },
      { id: 'build-stack', name: 'Katuwang Build Demo' },
      { id: 'hiram-snap', name: 'Katuwang 5-6 Demo' },
      { id: 'ledger-flow', name: 'Katuwang Ledger Demo' },
      { id: 'sahod-flow', name: 'Katuwang Sahod Demo' },
      { id: 'biyahe-sync', name: 'Katuwang Biyahe Demo' },
      { id: 'ani-grow', name: 'Katuwang Ani Demo' },
      { id: 'bite-snap', name: 'Katuwang Bite Demo' },
      { id: 'timpla-track', name: 'Katuwang Timpla Demo' },
      { id: 'ganap-master', name: 'Katuwang Ganap Demo' },
      { id: 'spin-snap', name: 'Katuwang Spin Demo' },
      { id: 'hydro-sync', name: 'Katuwang Hydro Demo' },
      { id: 'auto-boss', name: 'Katuwang Auto Demo' },
      { id: 'wellness-pro', name: 'Katuwang Wellness Demo' },
      { id: 'trim-track', name: 'Katuwang Trim Demo' },
      { id: 'rep-sync', name: 'Katuwang Rep Demo' }
    ];

    const primaryTenantId = `demo-${modules[0].id}-${uid.substring(0, 5)}`;

    console.log(`🏢 Provisioning ${modules.length} Tenants for Demo Account...`);
    
    // 1. Create Tenant and User Profiles First
    for (const mod of modules) {
      const tId = `demo-${mod.id}-${uid.substring(0, 5)}`;
      const tenantRef = doc(db, 'tenants', tId);
      await setDoc(tenantRef, {
        id: tId,
        name: mod.name,
        moduleType: mod.id,
        unlockedModules: [mod.id], 
        pricingTier: 'standard_199',
        subscriptionStatus: 'active',
        ownerUid: uid,
        staffUids: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
      uid: uid,
      fullName: 'Juan Dela Cruz (Demo)',
      email: DEMO_EMAIL,
      role: 'owner',
      tenantId: primaryTenantId,
      moduleType: modules[0].id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log(`✅ Profiles Created. Waiting 2 seconds for security rules propagation...`);
    await new Promise(r => setTimeout(r, 2000));

    // 2. Seed Subcollections in a Batch
    const batch = writeBatch(db);

    console.log(`📦 Generating Fake Products (Benta Snap)...`);
    const products = [
      { name: 'Jasmine Rice (1kg)', category: 'Grains', costPrice: 4500, salePrice: 5500, currentStock: 120, minStock: 20, unit: 'kg' },
      { name: 'Canned Corned Beef', category: 'Canned Goods', costPrice: 3800, salePrice: 4500, currentStock: 8, minStock: 15, unit: 'pcs' },
      { name: 'Instant Noodles (Spicy)', category: 'Groceries', costPrice: 1200, salePrice: 1500, currentStock: 0, minStock: 50, unit: 'pcs' },
      { name: 'Detergent Powder', category: 'Cleaning', costPrice: 6500, salePrice: 7500, currentStock: 45, minStock: 10, unit: 'pcs' },
      { name: 'Bottled Water (500ml)', category: 'Beverages', costPrice: 1000, salePrice: 1500, currentStock: 200, minStock: 30, unit: 'pcs' },
    ];

    products.forEach((p) => {
      const prodRef = doc(collection(db, 'tenants', primaryTenantId, 'products'));
      batch.set(prodRef, {
        id: prodRef.id,
        tenantId: primaryTenantId,
        ...p,
        isActive: true,
        createdAt: serverTimestamp(),
      });
    });

    console.log(`💸 Generating Fake Loans (5-6 Tracker)...`);
    const hiramTenantId = `demo-hiram-snap-${uid.substring(0, 5)}`;
    const loans = [
      { borrowerName: 'Maria Santos', totalAmount: 150000, balanceRemaining: 150000, status: 'unpaid', notes: 'Utang sa bigas' },
      { borrowerName: 'Pedro Penduko', totalAmount: 50000, balanceRemaining: 20000, status: 'unpaid', notes: 'Sari-sari store restock' },
      { borrowerName: 'Aling Nena', totalAmount: 85000, balanceRemaining: 0, status: 'paid', notes: 'Catering downpayment' },
    ];

    loans.forEach((l) => {
      const loanRef = doc(collection(db, 'tenants', hiramTenantId, 'credit_loans'));
      batch.set(loanRef, {
        id: loanRef.id,
        tenantId: hiramTenantId,
        ...l,
        dateLent: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    });

    console.log(`🎉 Generating Fake Events (Ganap Master)...`);
    const ganapTenantId = `demo-ganap-master-${uid.substring(0, 5)}`;
    const eventRef = doc(collection(db, 'tenants', ganapTenantId, 'events'));
    batch.set(eventRef, {
      id: eventRef.id,
      tenantId: ganapTenantId,
      name: 'Reyes Wedding Catering',
      type: 'Wedding',
      status: 'upcoming',
      date: new Date(Date.now() + 86400000 * 5).toISOString(), // 5 days from now
      budget: 5000000, // 50,000 pesos
      vendors: [
        { name: 'Katuwang Catering', role: 'Main Caterer', cost: 2500000, contact: '09123456789', isPaid: true },
        { name: 'Flower Shop', role: 'Florist', cost: 500000, contact: '', isPaid: false }
      ],
      createdAt: serverTimestamp(),
    });

    // Commit all changes
    console.log(`⏳ Committing Subcollections to Firestore...`);
    await batch.commit();

    console.log(`\n========================================`);
    console.log(`✅ DEMO ACCOUNT SUCCESSFULLY SEEDED!`);
    console.log(`========================================`);
    console.log(`Email:    ${DEMO_EMAIL}`);
    console.log(`Password: ${DEMO_PASSWORD}`);
    console.log(`Primary Store ID: ${primaryTenantId}`);
    console.log(`========================================\n`);
    
    process.exit(0);

  } catch (error) {
    console.error(`❌ Seeder failed:`, error);
    process.exit(1);
  }
}

seedDemoAccount();
