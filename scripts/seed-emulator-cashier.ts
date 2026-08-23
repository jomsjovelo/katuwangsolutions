import * as admin from 'firebase-admin';
import { hashPinModern } from '../src/lib/server/pin-security';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-katuwang-offline-test';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

// 1. Strict Runtime Isolation Guard
if (!PROJECT_ID.startsWith('demo-')) {
  throw new Error(`[SECURITY_FAIL_CLOSED] Refusing to seed non-demo project '${PROJECT_ID}'. Only demo-* projects are permitted.`);
}

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const appName = 'seed-emulator-cashier';
const adminApp = admin.apps.find((a) => a?.name === appName) || admin.initializeApp({ projectId: PROJECT_ID }, appName);
const db = adminApp.firestore();
const auth = adminApp.auth();

export async function seedDemoCashierScenario() {
  console.log(`\n=== SEEDING ISOLATED DEMO FIREBASE EMULATOR (${PROJECT_ID}) ===\n`);

  const tenantId = 'demo-benta-store';
  const ownerUid = 'demo_owner_uid';
  const ownerEmail = 'demo@katuwangsolutions.com';
  const ownerPassword = 'DemoOwner2026!';
  const cashierUid = 'cashier_demo_uid_1';
  const staffAccountId = 'staff_cashier1';
  const shiftId = 'shift_demo_open_1';
  const businessCode = 'DEMO';
  const demoPin = '1234';

  const userBizCode = '0VGY66O'; // Zero-V-G-Y-6-6-Letter-O
  const userUsername = 'democashier2';
  const userPin = '0147';
  const userStaffAccountId = 'staff_democashier2';
  const userCashierUid = 'cashier_democashier2_uid';

  const pepperSecret = process.env.STAFF_PIN_PEPPER_V1 || 'katuwang_local_dev_pepper_secret_v1_12345';
  const hashedPin = await hashPinModern(demoPin, {
    peppers: { v1: pepperSecret },
    activeVersion: 'v1'
  });
  const hashedUserPin = await hashPinModern(userPin, {
    peppers: { v1: pepperSecret },
    activeVersion: 'v1'
  });

  const tenantRef = db.collection('tenants').doc(tenantId);

  // 1. Tenant
  await tenantRef.set({
    id: tenantId,
    name: 'Katuwang Demo Sari-Sari Store',
    businessCode: userBizCode,
    moduleType: 'benta-snap',
    primaryModuleType: 'benta-snap',
    subscriptionStatus: 'active',
    pricingTier: 'standard_100',
    ownerUid,
    ownerEmail,
    staffUids: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // 1b. Owner User Profile in Firestore
  await db.collection('users').doc(ownerUid).set({
    uid: ownerUid,
    email: ownerEmail,
    displayName: 'Demo Owner',
    role: 'owner',
    tenantId: tenantId,
    tenantIds: [tenantId],
    approvalStatus: 'approved',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // 2. Business Code Lookups
  await db.collection('business_codes').doc(businessCode).set({
    tenantId,
    code: businessCode,
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  await db.collection('business_codes').doc(userBizCode).set({
    tenantId,
    code: userBizCode,
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  // Delete accidental deprecated 'OVGY660' (Letter O / Zero 0 mismatch) if existing
  await db.collection('business_codes').doc('OVGY660').delete().catch(() => {});

  // 3. Staff Accounts (Properly Peppered PIN Hash only; NEVER plaintext)
  await tenantRef.collection('staff_accounts').doc(staffAccountId).set({
    id: staffAccountId,
    tenantId,
    username: 'cashier1',
    usernameLower: 'cashier1',
    displayName: 'Ana Cashier',
    role: 'cashier',
    status: 'active',
    sessionVersion: 1,
    pinHash: hashedPin,
    authUid: cashierUid,
    activeShiftId: shiftId,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const userShiftId = 'shift_demo_open_2';

  await tenantRef.collection('staff_accounts').doc(userStaffAccountId).set({
    id: userStaffAccountId,
    tenantId,
    username: userUsername,
    usernameLower: userUsername.toLowerCase(),
    displayName: 'Demo Cashier 2',
    role: 'cashier',
    status: 'active',
    sessionVersion: 1,
    pinHash: hashedUserPin,
    authUid: userCashierUid,
    activeShiftId: userShiftId,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // 4. Firebase Auth Users in Emulator
  // 4a. Owner Auth User
  try {
    await auth.getUser(ownerUid);
    await auth.updateUser(ownerUid, {
      email: ownerEmail,
      password: ownerPassword,
      emailVerified: true,
      displayName: 'Demo Owner'
    });
  } catch {
    await auth.createUser({
      uid: ownerUid,
      email: ownerEmail,
      password: ownerPassword,
      emailVerified: true,
      displayName: 'Demo Owner'
    });
  }

  await auth.setCustomUserClaims(ownerUid, {
    role: 'owner',
    tenantId: tenantId
  });

  // 4b. Cashier Auth Users
  for (const [uid, name] of [[cashierUid, 'Ana Cashier'], [userCashierUid, 'Demo Cashier 2']]) {
    try {
      await auth.getUser(uid);
      await auth.updateUser(uid, { displayName: name });
    } catch {
      await auth.createUser({
        uid,
        displayName: name
      });
    }
  }

  await auth.setCustomUserClaims(cashierUid, {
    role: 'cashier',
    tenantId,
    staffAccountId,
    sessionVersion: 1
  });

  await auth.setCustomUserClaims(userCashierUid, {
    role: 'cashier',
    tenantId,
    staffAccountId: userStaffAccountId,
    sessionVersion: 1
  });

  // 4c. Local Master Admin Auth User
  const masterAdminUid = 'demo_master_admin_uid';
  const masterAdminEmail = 'jomsjovelo@gmail.com';
  const masterAdminPassword = process.env.LOCAL_MASTER_ADMIN_PASSWORD || 'DemoMasterAdmin2026!';

  try {
    await auth.getUser(masterAdminUid);
    await auth.updateUser(masterAdminUid, {
      email: masterAdminEmail,
      password: masterAdminPassword,
      emailVerified: true,
      displayName: 'Master Admin (Joms)'
    });
  } catch {
    await auth.createUser({
      uid: masterAdminUid,
      email: masterAdminEmail,
      password: masterAdminPassword,
      emailVerified: true,
      displayName: 'Master Admin (Joms)'
    });
  }

  await auth.setCustomUserClaims(masterAdminUid, {
    admin: true,
    role: 'admin',
    isMasterAdmin: true,
    adminRole: 'superadmin'
  });

  // 5. Open Shifts
  await tenantRef.collection('shifts').doc(shiftId).set({
    id: shiftId,
    tenantId,
    moduleId: 'benta-snap',
    staffId: `staff_${staffAccountId}`,
    staffAccountId,
    staffName: 'Ana Cashier',
    openedBy: `staff_${staffAccountId}`,
    status: 'open',
    reconciliationVersion: 1,
    startingCash: 100000, // ₱1,000.00
    cashSales: 0,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 0,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 0,
    openedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await tenantRef.collection('shifts').doc(userShiftId).set({
    id: userShiftId,
    tenantId,
    moduleId: 'benta-snap',
    staffId: `staff_${userStaffAccountId}`,
    staffAccountId: userStaffAccountId,
    staffName: 'Demo Cashier 2',
    openedBy: `staff_${userStaffAccountId}`,
    status: 'open',
    reconciliationVersion: 1,
    startingCash: 100000, // ₱1,000.00
    cashSales: 0,
    gcashSales: 0,
    mayaSales: 0,
    totalShiftSales: 0,
    electronicReceipts: 0,
    physicalCashAdjustments: 0,
    saleCount: 0,
    openedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // 6. Master Cash Register Account
  await tenantRef.collection('accounts').doc('master-cash').set({
    id: 'master-cash',
    tenantId,
    name: 'Main Cash Drawer',
    type: 'asset',
    balance: 100000,
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // 7. Active Products with Historical Cost
  const demoProducts = [
    { id: 'prod_rice', name: 'Sinandomeng Rice 1kg', salePrice: 5500, costPrice: 4200, currentStock: 25, unit: 'kg', category: 'Grains' },
    { id: 'prod_sardines', name: 'Ligo Sardines Red 155g', salePrice: 2800, costPrice: 2100, currentStock: 40, unit: 'can', category: 'Canned Goods' },
    { id: 'prod_coffee', name: 'Nescafe 3-in-1 Original', salePrice: 1500, costPrice: 1000, currentStock: 50, unit: 'sachet', category: 'Beverages' },
    { id: 'prod_oil', name: 'Cooking Oil 500ml', salePrice: 4500, costPrice: 3200, currentStock: 15, unit: 'btl', category: 'Cooking' }
  ];

  for (const p of demoProducts) {
    await tenantRef.collection('products').doc(p.id).set({
      ...p,
      tenantId,
      moduleId: 'benta-snap',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // 8. Master Admin Firestore Records
  await db.collection('admins').doc(masterAdminUid).set({
    uid: masterAdminUid,
    email: masterAdminEmail,
    displayName: 'Master Admin (Joms)',
    role: 'superadmin',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await db.collection('users').doc(masterAdminUid).set({
    uid: masterAdminUid,
    email: masterAdminEmail,
    displayName: 'Master Admin (Joms)',
    role: 'superadmin',
    approvalStatus: 'approved',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('✔ Demo Tenant: demo-benta-store');
  console.log(`✔ Demo Business Code: ${businessCode}`);
  console.log(`✔ Cashier Account: username "cashier1" (PIN: "${demoPin}" -> scrypt hash stored)`);
  console.log(`✔ Open Shift ID: ${shiftId}`);
  console.log(`✔ Products Seeded: ${demoProducts.length} items`);
  console.log(`✔ Master Admin Seeded: ${masterAdminEmail} (${masterAdminUid})`);
  console.log('\nSeed completed successfully in local emulator.\n');
}

if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.endsWith('seed-emulator-cashier.ts'))) {
  seedDemoCashierScenario().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
