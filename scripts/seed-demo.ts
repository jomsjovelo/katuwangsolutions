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
      { id: '5-6-tracker', name: '5-6 Tracker' },
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
      { id: 'rep-sync', name: 'Katuwang Rep Demo' },
      { id: 'rental', name: 'Katuwang Rental Demo' }
    ];

    const UNIFIED_DEMO_CODE = 'DEMO123';
    const primaryTenantId = `demo-${modules[0].id}-${uid.substring(0, 5)}`;

    console.log(`🏢 Provisioning ${modules.length} Tenants for Demo Account...`);
    
    // 1. Create Tenant and User Profiles First
    for (const mod of modules) {
      const tId = `demo-${mod.id}-${uid.substring(0, 5)}`;
      const tenantRef = doc(db, 'tenants', tId);
      await setDoc(tenantRef, {
        id: tId,
        name: 'Katuwang Demo',
        moduleType: mod.id,
        unlockedModules: [mod.id], 
        pricingTier: 'foc',
        subscriptionStatus: 'active',
        ownerUid: uid,
        ownerEmail: DEMO_EMAIL,
        staffUids: [],
        businessCode: UNIFIED_DEMO_CODE,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // Create Business Code Document for Primary Tenant
    const codeRef = doc(db, 'business_codes', UNIFIED_DEMO_CODE);
    await setDoc(codeRef, {
      code: UNIFIED_DEMO_CODE,
      tenantId: primaryTenantId,
      moduleType: modules[0].id,
      createdAt: serverTimestamp()
    });

    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
      uid: uid,
      fullName: 'Katuwang Demo',
      email: DEMO_EMAIL,
      role: 'owner',
      tenantId: primaryTenantId,
      moduleType: modules[0].id,
      referralCode: UNIFIED_DEMO_CODE,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Create Referral Code Document for Owner
    const refCodeDoc = doc(db, 'referral_codes', UNIFIED_DEMO_CODE);
    await setDoc(refCodeDoc, {
      uid: uid,
      createdAt: serverTimestamp()
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
    const hiramTenantId = `demo-5-6-tracker-${uid.substring(0, 5)}`;
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

    console.log(`🛒 Generating Fake Data for Katuwang Fresh Demo...`);
    const freshTenantId = `demo-fresh-tally-${uid.substring(0, 5)}`;
    [
      { name: 'Cabbage (Repolyo)', category: 'Vegetables', costPrice: 4000, salePrice: 6000, currentStock: 50, unit: 'kg' },
      { name: 'Pork Belly (Liempo)', category: 'Meat', costPrice: 28000, salePrice: 35000, currentStock: 25, unit: 'kg' }
    ].forEach(p => {
      const ref = doc(collection(db, 'tenants', freshTenantId, 'products'));
      batch.set(ref, { id: ref.id, tenantId: freshTenantId, ...p, isActive: true, createdAt: serverTimestamp() });
    });

    console.log(`🔨 Generating Fake Data for Katuwang Build Demo...`);
    const buildTenantId = `demo-build-stack-${uid.substring(0, 5)}`;
    [
      { name: 'Portland Cement', category: 'Construction', costPrice: 21000, salePrice: 25000, currentStock: 200, unit: 'bag' },
      { name: 'Marine Plywood 1/2', category: 'Wood', costPrice: 50000, salePrice: 65000, currentStock: 30, unit: 'pcs' }
    ].forEach(p => {
      const ref = doc(collection(db, 'tenants', buildTenantId, 'products'));
      batch.set(ref, { id: ref.id, tenantId: buildTenantId, ...p, isActive: true, createdAt: serverTimestamp() });
    });

    console.log(`📒 Generating Fake Data for Katuwang Ledger Demo...`);
    const ledgerTenantId = `demo-ledger-flow-${uid.substring(0, 5)}`;
    [
      { description: 'Meralco Bill', amount: 850000, type: 'expense', category: 'Utilities', date: new Date().toISOString() },
      { description: 'Office Supplies', amount: 125000, type: 'expense', category: 'Supplies', date: new Date().toISOString() }
    ].forEach(t => {
      const ref = doc(collection(db, 'tenants', ledgerTenantId, 'transactions'));
      batch.set(ref, { id: ref.id, tenantId: ledgerTenantId, ...t, createdAt: serverTimestamp() });
    });

    console.log(`👥 Generating Fake Data for Katuwang Sahod Demo...`);
    const sahodTenantId = `demo-sahod-flow-${uid.substring(0, 5)}`;
    [
      { fullName: 'Mark Bautista', role: 'Cashier', basicPay: 1500000, status: 'active' },
      { fullName: 'Sarah Geronimo', role: 'Manager', basicPay: 2500000, status: 'active' }
    ].forEach(e => {
      const ref = doc(collection(db, 'tenants', sahodTenantId, 'staff'));
      batch.set(ref, { id: ref.id, tenantId: sahodTenantId, ...e, createdAt: serverTimestamp() });
    });

    console.log(`🚚 Generating Fake Data for Katuwang Biyahe Demo...`);
    const biyaheTenantId = `demo-biyahe-sync-${uid.substring(0, 5)}`;
    [
      { plateNumber: 'ABC-1234', model: 'Isuzu Elf', status: 'available', capacity: '3 Tons' },
      { plateNumber: 'XYZ-9876', model: 'Mitsubishi L300', status: 'on_trip', capacity: '1 Ton' }
    ].forEach(v => {
      const ref = doc(collection(db, 'tenants', biyaheTenantId, 'fleet'));
      batch.set(ref, { id: ref.id, tenantId: biyaheTenantId, ...v, createdAt: serverTimestamp() });
    });

    console.log(`🌾 Generating Fake Data for Katuwang Ani Demo...`);
    const aniTenantId = `demo-ani-grow-${uid.substring(0, 5)}`;
    [
      { name: 'Dinorado Rice', type: 'Harvest', quantity: 50, unit: 'Sacks', status: 'stored' },
      { name: 'Urea Fertilizer', type: 'Input', quantity: 20, unit: 'Bags', status: 'available' }
    ].forEach(a => {
      const ref = doc(collection(db, 'tenants', aniTenantId, 'inventory_transactions'));
      batch.set(ref, { id: ref.id, tenantId: aniTenantId, ...a, createdAt: serverTimestamp() });
    });

    console.log(`🍔 Generating Fake Data for Katuwang Bite Demo...`);
    const biteTenantId = `demo-bite-snap-${uid.substring(0, 5)}`;
    [
      { name: '2pc Fried Chicken Meal', category: 'Meals', price: 15000, isAvailable: true },
      { name: 'Classic Cheeseburger', category: 'Sandwiches', price: 8500, isAvailable: true }
    ].forEach(m => {
      const ref = doc(collection(db, 'tenants', biteTenantId, 'menu_items'));
      batch.set(ref, { id: ref.id, tenantId: biteTenantId, ...m, createdAt: serverTimestamp() });
    });

    console.log(`☕ Generating Fake Data for Katuwang Timpla Demo...`);
    const timplaTenantId = `demo-timpla-track-${uid.substring(0, 5)}`;
    [
      { name: 'Iced Caramel Macchiato', category: 'Cold Coffee', price: 16000, isAvailable: true },
      { name: 'Matcha Latte', category: 'Tea', price: 17500, isAvailable: true }
    ].forEach(m => {
      const ref = doc(collection(db, 'tenants', timplaTenantId, 'menu_items'));
      batch.set(ref, { id: ref.id, tenantId: timplaTenantId, ...m, createdAt: serverTimestamp() });
    });

    console.log(`🧺 Generating Fake Data for Katuwang Spin Demo...`);
    const spinTenantId = `demo-spin-snap-${uid.substring(0, 5)}`;
    [
      { name: 'Wash & Fold (per kg)', category: 'Service', price: 3500, isAvailable: true },
      { name: 'Comforter Wash', category: 'Service', price: 15000, isAvailable: true }
    ].forEach(s => {
      const ref = doc(collection(db, 'tenants', spinTenantId, 'menu_items'));
      batch.set(ref, { id: ref.id, tenantId: spinTenantId, ...s, createdAt: serverTimestamp() });
    });

    console.log(`💧 Generating Fake Data for Katuwang Hydro Demo...`);
    const hydroTenantId = `demo-hydro-sync-${uid.substring(0, 5)}`;
    [
      { name: '5-Gallon Purified Water', category: 'Refill', price: 3500, isAvailable: true },
      { name: 'Alkaline Water Refill', category: 'Refill', price: 5000, isAvailable: true }
    ].forEach(p => {
      const ref = doc(collection(db, 'tenants', hydroTenantId, 'products'));
      batch.set(ref, { id: ref.id, tenantId: hydroTenantId, ...p, createdAt: serverTimestamp() });
    });

    console.log(`🔧 Generating Fake Data for Katuwang Auto Demo...`);
    const autoTenantId = `demo-auto-boss-${uid.substring(0, 5)}`;
    [
      { customerName: 'John Doe', vehicle: 'Toyota Vios', service: 'Change Oil', status: 'in_progress', totalAmount: 250000 },
      { customerName: 'Jane Smith', vehicle: 'Honda Civic', service: 'Brake Pad Replacement', status: 'completed', totalAmount: 450000 }
    ].forEach(j => {
      const ref = doc(collection(db, 'tenants', autoTenantId, 'jobs'));
      batch.set(ref, { id: ref.id, tenantId: autoTenantId, ...j, createdAt: serverTimestamp() });
    });

    console.log(`💪 Generating Fake Data for Katuwang Wellness Demo...`);
    const wellnessTenantId = `demo-wellness-pro-${uid.substring(0, 5)}`;
    [
      { memberName: 'Chris Evans', plan: 'Annual VIP', status: 'active', expiryDate: new Date(Date.now() + 86400000 * 365).toISOString() },
      { memberName: 'Scarlett Johansson', plan: 'Monthly Basic', status: 'active', expiryDate: new Date(Date.now() + 86400000 * 30).toISOString() }
    ].forEach(m => {
      const ref = doc(collection(db, 'tenants', wellnessTenantId, 'gym_memberships'));
      batch.set(ref, { id: ref.id, tenantId: wellnessTenantId, ...m, createdAt: serverTimestamp() });
    });

    console.log(`✂️ Generating Fake Data for Katuwang Trim Demo...`);
    const trimTenantId = `demo-trim-track-${uid.substring(0, 5)}`;
    [
      { name: 'Men Classic Haircut', category: 'Hair', price: 20000, durationMins: 30 },
      { name: 'Hair Color & Treatment', category: 'Color', price: 150000, durationMins: 120 }
    ].forEach(s => {
      const ref = doc(collection(db, 'tenants', trimTenantId, 'salon_services'));
      batch.set(ref, { id: ref.id, tenantId: trimTenantId, ...s, createdAt: serverTimestamp() });
    });

    console.log(`📈 Generating Fake Data for Katuwang Rep Demo...`);
    const repTenantId = `demo-rep-sync-${uid.substring(0, 5)}`;
    [
      { repName: 'Alex Gonzaga', territory: 'North GMA', currentSales: 5000000, targetSales: 10000000 },
      { repName: 'Luis Manzano', territory: 'South GMA', currentSales: 8500000, targetSales: 8000000 }
    ].forEach(r => {
      const ref = doc(collection(db, 'tenants', repTenantId, 'users'));
      batch.set(ref, { id: ref.id, tenantId: repTenantId, ...r, role: 'sales_rep', createdAt: serverTimestamp() });
    });

    console.log(`⛺ Generating Fake Data for Katuwang Rental Demo...`);
    const rentalTenantId = `demo-rental-${uid.substring(0, 5)}`;
    [
      { name: '10x10 Event Tent', category: 'Equipment', dailyRate: 150000, totalQuantity: 10, availableQuantity: 8 },
      { name: 'Monobloc Chair', category: 'Furniture', dailyRate: 1500, totalQuantity: 200, availableQuantity: 150 }
    ].forEach(i => {
      const ref = doc(collection(db, 'tenants', rentalTenantId, 'rental_inventory'));
      batch.set(ref, { id: ref.id, tenantId: rentalTenantId, ...i, createdAt: serverTimestamp() });
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
