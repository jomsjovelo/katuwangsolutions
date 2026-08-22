import fs from 'fs';
import path from 'path';
import { 
  initializeTestEnvironment, 
  assertSucceeds, 
  assertFails, 
  RulesTestEnvironment 
} from '@firebase/rules-unit-testing';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  addDoc 
} from 'firebase/firestore';
import { generateCashierAuthUid } from '../src/lib/server/pin-security';

const PROJECT_ID = 'demo-katuwang-security-test';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

// Enforceable Runtime Isolation Check: Refuse execution unless demo project on loopback host
if (!PROJECT_ID.startsWith('demo-') || (!EMULATOR_HOST.startsWith('127.0.0.1') && !EMULATOR_HOST.startsWith('localhost'))) {
  throw new Error(`[SECURITY_FAIL_CLOSED] Runtime isolation violation! Project: '${PROJECT_ID}', Host: '${EMULATOR_HOST}'`);
}

let testEnv: RulesTestEnvironment;

const TENANT_A = 'tenant_a_123';
const TENANT_B = 'tenant_b_456';
const OWNER_A_UID = 'owner_a_uid';
const OWNER_B_UID = 'owner_b_uid';

const CASHIER_A_STAFF_ID = 'staff_a_001';
const CASHIER_A_AUTH_UID = generateCashierAuthUid(TENANT_A, CASHIER_A_STAFF_ID);

const CASHIER_B_STAFF_ID = 'staff_b_001';
const CASHIER_B_AUTH_UID = generateCashierAuthUid(TENANT_B, CASHIER_B_STAFF_ID);

const DISABLED_STAFF_ID = 'staff_disabled_001';
const DISABLED_AUTH_UID = generateCashierAuthUid(TENANT_A, DISABLED_STAFF_ID);

let passed = 0;
let failed = 0;

async function check(promise: Promise<any>, expected: 'ALLOW' | 'DENY', description: string) {
  try {
    if (expected === 'ALLOW') {
      await assertSucceeds(promise);
      console.log(`  ✓ [ALLOW] ${description}`);
      passed++;
    } else {
      await assertFails(promise);
      console.log(`  ✓ [DENY]  ${description}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`  ✗ FAIL: Expected ${expected} for: ${description} (Error: ${err?.message})`);
    failed++;
  }
}

async function runEmulatorRulesSuite() {
  console.log('================================================================');
  console.log('  FIRESTORE RULES EMULATOR SUITE — LEAST PRIVILEGE VERIFICATION');
  console.log(`  Project: ${PROJECT_ID} | Host: ${EMULATOR_HOST}`);
  console.log('================================================================\n');

  const rulesContent = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: rulesContent,
      host: '127.0.0.1',
      port: 8080
    }
  });

  // Seed baseline data using bypass security context
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // Tenants
    await setDoc(doc(db, 'tenants', TENANT_A), {
      ownerUid: OWNER_A_UID,
      name: 'Tenant Alpha Store',
      businessCode: 'ALPHA123',
      staffUids: []
    });

    await setDoc(doc(db, 'tenants', TENANT_B), {
      ownerUid: OWNER_B_UID,
      name: 'Tenant Beta Store',
      businessCode: 'BETA123',
      staffUids: []
    });

    // Active Cashier A record
    await setDoc(doc(db, 'tenants', TENANT_A, 'staff_accounts', CASHIER_A_STAFF_ID), {
      id: CASHIER_A_STAFF_ID,
      tenantId: TENANT_A,
      username: 'cashier_a',
      usernameLower: 'cashier_a',
      status: 'active',
      sessionVersion: 1,
      authUid: CASHIER_A_AUTH_UID
    });

    // Active Cashier B record
    await setDoc(doc(db, 'tenants', TENANT_B, 'staff_accounts', CASHIER_B_STAFF_ID), {
      id: CASHIER_B_STAFF_ID,
      tenantId: TENANT_B,
      username: 'cashier_b',
      usernameLower: 'cashier_b',
      status: 'active',
      sessionVersion: 1,
      authUid: CASHIER_B_AUTH_UID
    });

    // Disabled Cashier record
    await setDoc(doc(db, 'tenants', TENANT_A, 'staff_accounts', DISABLED_STAFF_ID), {
      id: DISABLED_STAFF_ID,
      tenantId: TENANT_A,
      username: 'cashier_disabled',
      usernameLower: 'cashier_disabled',
      status: 'disabled',
      sessionVersion: 2,
      authUid: DISABLED_AUTH_UID
    });

    // Sample product in Tenant A
    await setDoc(doc(db, 'tenants', TENANT_A, 'products', 'prod_001'), {
      tenantId: TENANT_A,
      name: 'Coke 500ml',
      salePrice: 3500,
      currentStock: 50,
      updatedAt: null
    });

    // Sample product in Tenant B
    await setDoc(doc(db, 'tenants', TENANT_B, 'products', 'prod_b001'), {
      tenantId: TENANT_B,
      name: 'Sprite 500ml',
      salePrice: 3500,
      currentStock: 20,
      updatedAt: null
    });

    // Sample sale in Tenant A
    await setDoc(doc(db, 'tenants', TENANT_A, 'sales', 'sale_001'), {
      id: 'sale_001',
      tenantId: TENANT_A,
      items: [{ productId: 'prod_001', quantity: 1, price: 3500 }],
      totalAmount: 3500,
      paymentMethod: 'cash'
    });

    // Sample shift in Tenant A
    await setDoc(doc(db, 'tenants', TENANT_A, 'shifts', 'shift_001'), {
      tenantId: TENANT_A,
      staffId: `staff_${CASHIER_A_STAFF_ID}`,
      status: 'open',
      startingCash: 100000
    });

    // Sample transaction in Tenant A
    await setDoc(doc(db, 'tenants', TENANT_A, 'transactions', 'tx_001'), {
      tenantId: TENANT_A,
      type: 'income',
      amount: 3500,
      description: 'Retail Sale'
    });

    // Sample retail credit in Tenant A
    await setDoc(doc(db, 'tenants', TENANT_A, 'retail_credits', 'cred_001'), {
      id: 'cred_001',
      tenantId: TENANT_A,
      name: 'Juan Dela Cruz',
      amount: 3500,
      status: 'unpaid'
    });

    // Master cash account in Tenant A
    await setDoc(doc(db, 'tenants', TENANT_A, 'accounts', 'master-cash'), {
      id: 'master-cash',
      name: 'Main Cash Register',
      tenantId: TENANT_A,
      balance: 100000
    });

    // Public documents
    await setDoc(doc(db, 'business_codes', 'ALPHA123'), { tenantId: TENANT_A, code: 'ALPHA123' });
    await setDoc(doc(db, 'staff_usernames', 'cashier_a'), { tenantId: TENANT_A, staffAccountId: CASHIER_A_STAFF_ID });
    await setDoc(doc(db, 'referral_codes', 'REF123'), { uid: OWNER_A_UID, code: 'REF123' });
    await setDoc(doc(db, 'system', 'maintenance'), { active: false });
  });

  // Client contexts
  const cashierA = testEnv.authenticatedContext(CASHIER_A_AUTH_UID, {
    role: 'cashier',
    tenantId: TENANT_A,
    staffAccountId: CASHIER_A_STAFF_ID,
    sessionVersion: 1
  }).firestore();

  const cashierB = testEnv.authenticatedContext(CASHIER_B_AUTH_UID, {
    role: 'cashier',
    tenantId: TENANT_B,
    staffAccountId: CASHIER_B_STAFF_ID,
    sessionVersion: 1
  }).firestore();

  const ownerA = testEnv.authenticatedContext(OWNER_A_UID).firestore();
  const unauthenticated = testEnv.unauthenticatedContext().firestore();

  // --- SECTION 1: SECURE CASHIER HAS NO DIRECT TENANT DATA AUTHORITY ---
  console.log('1. Secure Cashier Direct Access Is Denied');
  {
    // Products
    await check(getDoc(doc(cashierA, 'tenants', TENANT_A, 'products', 'prod_001')), 'DENY', 'Cashier A cannot read internal products or cost data');
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A, 'products', 'prod_001'), { currentStock: 48 }), 'DENY', 'Cashier A cannot directly modify stock');
    await check(setDoc(doc(cashierA, 'tenants', TENANT_A, 'products', 'prod_new_002'), {
      tenantId: TENANT_A,
      name: 'Pepsi',
      salePrice: 3500,
      currentStock: 10
    }), 'DENY', 'Cashier A cannot create products');

    // Sales
    await check(setDoc(doc(cashierA, 'tenants', TENANT_A, 'sales', 'sale_new_002'), {
      id: 'sale_new_002',
      tenantId: TENANT_A,
      items: [{ productId: 'prod_001', quantity: 2, price: 3500 }],
      totalAmount: 7000,
      paymentMethod: 'cash'
    }), 'DENY', 'Cashier A cannot directly create sales');
    await check(getDoc(doc(cashierA, 'tenants', TENANT_A, 'sales', 'sale_001')), 'DENY', 'Cashier A cannot read tenant-wide historical sales');
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A, 'sales', 'sale_001'), { totalAmount: 6500 }), 'DENY', 'Cashier A cannot directly update sales');

    // Inventory Transactions
    await check(setDoc(doc(cashierA, 'tenants', TENANT_A, 'inventory_transactions', 'inv_tx_001'), {
      tenantId: TENANT_A,
      productId: 'prod_001',
      quantity: -2,
      type: 'sale',
      balanceAfter: 48,
      performedBy: `staff_${CASHIER_A_STAFF_ID}`
    }), 'DENY', 'Cashier A cannot directly record inventory movements');
    await check(getDoc(doc(cashierA, 'tenants', TENANT_A, 'inventory_transactions', 'inv_tx_001')), 'DENY', 'Cashier A cannot directly read inventory movements');

    // Shifts
    await check(getDoc(doc(cashierA, 'tenants', TENANT_A, 'shifts', 'shift_001')), 'DENY', 'Cashier A cannot directly read shifts');
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A, 'shifts', 'shift_001'), {
      status: 'closed',
      endingCash: 170000
    }), 'DENY', 'Cashier A cannot directly close shifts');

    // Transactions (Cash Drawer Ledger)
    await check(setDoc(doc(cashierA, 'tenants', TENANT_A, 'transactions', 'tx_new_002'), {
      tenantId: TENANT_A,
      type: 'income',
      amount: 7000
    }), 'DENY', 'Cashier A cannot directly write the financial transaction ledger');
    await check(getDoc(doc(cashierA, 'tenants', TENANT_A, 'transactions', 'tx_001')), 'DENY', 'Cashier A cannot read financial transactions');
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A, 'transactions', 'tx_001'), {
      amount: 4000,
      description: 'Adjusted Sale'
    }), 'DENY', 'Cashier A cannot rewrite financial ledger amounts');

    // Retail Credits (Utang / Palista)
    await check(setDoc(doc(cashierA, 'tenants', TENANT_A, 'retail_credits', 'cred_new_002'), {
      id: 'cred_new_002',
      tenantId: TENANT_A,
      name: 'Maria Santos',
      amount: 3500,
      status: 'unpaid'
    }), 'DENY', 'Cashier A cannot directly create a financial credit record');
    await check(getDoc(doc(cashierA, 'tenants', TENANT_A, 'retail_credits', 'cred_001')), 'DENY', 'Cashier A cannot read retail credits');
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A, 'retail_credits', 'cred_001'), { amount: 3000 }), 'DENY', 'Cashier A cannot rewrite credit amounts');

    // Master Cash Account
    await check(getDoc(doc(cashierA, 'tenants', TENANT_A, 'accounts', 'master-cash')), 'DENY', 'Cashier A cannot read master-cash');
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A, 'accounts', 'master-cash'), { balance: 107000 }), 'DENY', 'Cashier A cannot directly mutate master-cash');

    // Audit Log (Create-only)
    await check(setDoc(doc(cashierA, 'tenants', TENANT_A, 'audit_log', 'audit_001'), {
      type: 'apply_discount',
      description: 'Discount applied',
      userId: `staff_${CASHIER_A_STAFF_ID}`,
      userName: 'Cashier A'
    }), 'DENY', 'Cashier A cannot directly append audit records');
  }

  // --- SECTION 2: FIELD CONSTRAINTS & UNAUTHORIZED FIELD MUTATION DENIALS ---
  console.log('\n2. Field Constraints & Unauthorized Field Mutation Denials');
  {
    // Product: Unauthorized field change (e.g. price tampering or name tampering during stock update)
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A, 'products', 'prod_001'), { salePrice: 100 }), 'DENY', 'Cashier A CANNOT mutate salePrice on product (Stock updates restricted)');
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A, 'products', 'prod_001'), { name: 'Hacked Name' }), 'DENY', 'Cashier A CANNOT mutate name on product');
    await check(setDoc(doc(cashierA, 'tenants', TENANT_A, 'products', 'prod_extra_field'), {
      tenantId: TENANT_A,
      name: 'Injected Product',
      salePrice: 100,
      currentStock: 1,
      ownerUid: CASHIER_A_AUTH_UID
    }), 'DENY', 'Cashier A CANNOT add an unapproved field to a product');
    await check(setDoc(doc(cashierA, 'tenants', TENANT_A, 'sales', 'sale_wrong_id'), {
      id: 'forged_id',
      tenantId: TENANT_A,
      items: [],
      totalAmount: 100,
      paymentMethod: 'cash'
    }), 'DENY', 'Cashier A CANNOT forge a sale document ID');
    await check(setDoc(doc(cashierA, 'tenants', TENANT_A, 'inventory_transactions', 'inv_forged_actor'), {
      tenantId: TENANT_A,
      productId: 'prod_001',
      type: 'sale',
      quantity: -1,
      balanceAfter: 47,
      performedBy: 'staff_other_cashier'
    }), 'DENY', 'Cashier A CANNOT forge the inventory actor identity');

    // Sales: Tampering with tenantId or sale id
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A, 'sales', 'sale_001'), { tenantId: TENANT_B }), 'DENY', 'Cashier A CANNOT mutate tenantId on sale');
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A, 'sales', 'sale_001'), { id: 'other_sale_id' }), 'DENY', 'Cashier A CANNOT mutate id on sale');

    // Shift: Tampering with staffId or tenantId
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A, 'shifts', 'shift_001'), { staffId: 'other_staff' }), 'DENY', 'Cashier A CANNOT mutate staffId on shift');
    await check(setDoc(doc(cashierA, 'tenants', TENANT_A, 'shifts', 'shift_other'), {
      tenantId: TENANT_A,
      staffId: 'staff_other_cashier',
      status: 'open',
      startingCash: 0
    }), 'DENY', 'Cashier A CANNOT create a shift for another Cashier');

    // Account: Writing non-master-cash account or unauthorized fields
    await check(setDoc(doc(cashierA, 'tenants', TENANT_A, 'accounts', 'owner-secret-account'), {
      tenantId: TENANT_A,
      balance: 999999
    }), 'DENY', 'Cashier A CANNOT write to non-master-cash accounts');

    // Audit log immutability
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A, 'audit_log', 'audit_001'), { description: 'Tampered' }), 'DENY', 'Cashier A CANNOT update audit_log (Immutable)');
    await check(deleteDoc(doc(cashierA, 'tenants', TENANT_A, 'audit_log', 'audit_001')), 'DENY', 'Cashier A CANNOT delete audit_log (Immutable)');
  }

  // --- SECTION 3: DELETION PROTECTIONS (CASHIER DELETE STRICTLY DENIED) ---
  console.log('\n3. Deletion Protections (Cashier Delete Strictly Denied)');
  {
    await check(deleteDoc(doc(cashierA, 'tenants', TENANT_A, 'sales', 'sale_001')), 'DENY', 'Cashier A CANNOT delete sales document');
    await check(deleteDoc(doc(cashierA, 'tenants', TENANT_A, 'products', 'prod_001')), 'DENY', 'Cashier A CANNOT delete product document');
    await check(deleteDoc(doc(cashierA, 'tenants', TENANT_A, 'transactions', 'tx_001')), 'DENY', 'Cashier A CANNOT delete transaction document');
    await check(deleteDoc(doc(cashierA, 'tenants', TENANT_A, 'shifts', 'shift_001')), 'DENY', 'Cashier A CANNOT delete shift document');
    await check(deleteDoc(doc(cashierA, 'tenants', TENANT_A, 'inventory_transactions', 'inv_tx_001')), 'DENY', 'Cashier A CANNOT delete inventory transaction document');
    await check(deleteDoc(doc(cashierA, 'tenants', TENANT_A, 'retail_credits', 'cred_001')), 'DENY', 'Cashier A CANNOT delete retail credit document');
  }

  // --- SECTION 4: UNAUTHORIZED SENSITIVE COLLECTIONS ---
  console.log('\n4. Cashier Strictly Denied on Sensitive & Owner-Only Collections');
  {
    await check(getDoc(doc(cashierA, 'tenants', TENANT_A, 'staff_accounts', CASHIER_A_STAFF_ID)), 'DENY', 'Cashier A CANNOT read staff_accounts');
    await check(deleteDoc(doc(cashierA, 'tenants', TENANT_A, 'staff_accounts', CASHIER_A_STAFF_ID)), 'DENY', 'Cashier A CANNOT delete staff_accounts');
    await check(updateDoc(doc(cashierA, 'tenants', TENANT_A), { name: 'Hacked Store' }), 'DENY', 'Cashier A CANNOT modify tenant document');
    await check(getDoc(doc(cashierA, 'tenants', TENANT_A)), 'DENY', 'Cashier A receives tenant identity only through sanitized bootstrap');
    await check(deleteDoc(doc(cashierA, 'tenants', TENANT_A)), 'DENY', 'Cashier A CANNOT delete tenant document');
    await check(setDoc(doc(cashierA, 'tenants', 'cashier-forged-tenant'), { ownerUid: CASHIER_A_AUTH_UID }), 'DENY', 'Cashier A cannot create a browser-authorized tenant escape path');
    await check(getDoc(doc(cashierA, 'users', OWNER_A_UID)), 'DENY', 'Cashier A CANNOT read user profile documents');
    await check(setDoc(doc(cashierA, 'users', 'some_user'), { name: 'test' }), 'DENY', 'Cashier A CANNOT write user profile documents');
    await check(getDoc(doc(cashierA, 'admins', 'some_admin')), 'DENY', 'Cashier A CANNOT read admin documents');
    await check(getDoc(doc(cashierA, 'billing_logs', 'log_001')), 'DENY', 'Cashier A CANNOT read billing logs');
    await check(getDoc(doc(cashierA, 'admin_logs', 'log_001')), 'DENY', 'Cashier A CANNOT read admin logs');
    await check(getDoc(doc(cashierA, 'system_expenses', 'exp_001')), 'DENY', 'Cashier A CANNOT read system expenses');
    await check(getDoc(doc(cashierA, 'invites', 'inv_001')), 'DENY', 'Cashier A CANNOT read staff invites');

    // Rule inequality expression check: Cashier cannot write to business_codes / referral_codes / staff_usernames
    await check(setDoc(doc(cashierA, 'business_codes', 'HACKED'), { tenantId: TENANT_A }), 'DENY', 'Cashier A CANNOT write to business_codes');
    await check(setDoc(doc(cashierA, 'referral_codes', 'HACKED'), { uid: CASHIER_A_AUTH_UID }), 'DENY', 'Cashier A CANNOT write to referral_codes');
    await check(setDoc(doc(cashierA, 'staff_usernames', 'hacked_name'), { tenantId: TENANT_A }), 'DENY', 'Cashier A CANNOT write to staff_usernames');
    await check(getDoc(doc(cashierA, 'business_codes', 'ALPHA123')), 'DENY', 'Cashier A cannot directly enumerate business codes');
    await check(getDoc(doc(cashierA, 'staff_usernames', 'cashier_a')), 'DENY', 'Cashier A cannot directly enumerate username reservations');
  }

  // --- SECTION 5: CROSS-TENANT ISOLATION (CASHIER A -> TENANT B) ---
  console.log('\n5. Cross-Tenant Isolation (Cashier A -> Tenant B)');
  {
    await check(getDoc(doc(cashierA, 'tenants', TENANT_B, 'products', 'prod_b001')), 'DENY', 'Cashier A CANNOT read products in Tenant B');
    await check(setDoc(doc(cashierA, 'tenants', TENANT_B, 'sales', 'breach_sale'), {
      id: 'breach_sale',
      tenantId: TENANT_B,
      items: [],
      totalAmount: 1000,
      paymentMethod: 'cash'
    }), 'DENY', 'Cashier A CANNOT create sales in Tenant B');
    await check(getDoc(doc(cashierB, 'tenants', TENANT_A, 'products', 'prod_001')), 'DENY', 'Cashier B CANNOT read products in Tenant A');
  }

  // --- SECTION 6: REVOCATION, STATUS & MISMATCH CHECKS ---
  console.log('\n6. Revocation, Disabled Status & Identifier Mismatch Checks');
  {
    // Disabled Cashier
    const disabledCashier = testEnv.authenticatedContext(DISABLED_AUTH_UID, {
      role: 'cashier',
      tenantId: TENANT_A,
      staffAccountId: DISABLED_STAFF_ID,
      sessionVersion: 2
    }).firestore();
    await check(getDoc(doc(disabledCashier, 'tenants', TENANT_A, 'products', 'prod_001')), 'DENY', 'Disabled Cashier is DENIED all operations');

    // Stale sessionVersion
    const staleCashier = testEnv.authenticatedContext(CASHIER_A_AUTH_UID, {
      role: 'cashier',
      tenantId: TENANT_A,
      staffAccountId: CASHIER_A_STAFF_ID,
      sessionVersion: 999
    }).firestore();
    await check(getDoc(doc(staleCashier, 'tenants', TENANT_A, 'products', 'prod_001')), 'DENY', 'Stale sessionVersion is DENIED (Revocation check)');

    // Post-reset session version mismatch: token has sessionVersion 1, but doc is updated to sessionVersion 2
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'tenants', TENANT_A, 'staff_accounts', CASHIER_A_STAFF_ID), {
        sessionVersion: 2
      });
    });
    await check(getDoc(doc(cashierA, 'tenants', TENANT_A, 'products', 'prod_001')), 'DENY', 'Cashier A with sessionVersion 1 is DENIED after document rotated to sessionVersion 2');

    // Post-removal authorization failure: staff account doc deleted
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), 'tenants', TENANT_A, 'staff_accounts', CASHIER_A_STAFF_ID));
    });
    await check(getDoc(doc(cashierA, 'tenants', TENANT_A, 'products', 'prod_001')), 'DENY', 'Cashier A is DENIED after staff account record is removed');

    // Restore for remaining tests
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'tenants', TENANT_A, 'staff_accounts', CASHIER_A_STAFF_ID), {
        id: CASHIER_A_STAFF_ID,
        tenantId: TENANT_A,
        username: 'cashier_a',
        usernameLower: 'cashier_a',
        status: 'active',
        sessionVersion: 1,
        authUid: CASHIER_A_AUTH_UID
      });
    });

    // Mismatched Auth UID
    const spoofedUidCashier = testEnv.authenticatedContext('spoofed_uid_random', {
      role: 'cashier',
      tenantId: TENANT_A,
      staffAccountId: CASHIER_A_STAFF_ID,
      sessionVersion: 1
    }).firestore();
    await check(getDoc(doc(spoofedUidCashier, 'tenants', TENANT_A, 'products', 'prod_001')), 'DENY', 'Mismatched auth.uid vs stored authUid is DENIED');
  }

  // --- SECTION 7: UNAUTHENTICATED & OWNER BEHAVIOR ---
  console.log('\n7. Unauthenticated Restrictions & Legitimate Owner Operations');
  {
    // Unauthenticated visitor
    await check(getDoc(doc(unauthenticated, 'tenants', TENANT_A, 'products', 'prod_001')), 'DENY', 'Unauthenticated visitor is DENIED on tenant subcollections');
    await check(getDoc(doc(unauthenticated, 'business_codes', 'ALPHA123')), 'DENY', 'Unauthenticated visitor cannot enumerate business_codes');
    await check(getDoc(doc(unauthenticated, 'staff_usernames', 'cashier_a')), 'DENY', 'Unauthenticated visitor cannot enumerate staff_usernames');
    await check(getDoc(doc(unauthenticated, 'referral_codes', 'REF123')), 'ALLOW', 'Unauthenticated visitor can read referral_codes (Public flow)');
    await check(getDoc(doc(unauthenticated, 'system', 'maintenance')), 'ALLOW', 'Unauthenticated visitor can read system configs (Public flow)');

    // Legitimate Owner A
    await check(getDoc(doc(ownerA, 'tenants', TENANT_A, 'products', 'prod_001')), 'ALLOW', 'Owner A can read own tenant products');
    await check(updateDoc(doc(ownerA, 'tenants', TENANT_A, 'products', 'prod_001'), { currentStock: 49 }), 'ALLOW', 'Owner A retains direct product management');
    await check(getDoc(doc(ownerA, 'tenants', TENANT_A, 'transactions', 'tx_001')), 'ALLOW', 'Owner A retains financial history access');
    await check(getDoc(doc(ownerA, 'tenants', TENANT_A, 'accounts', 'master-cash')), 'ALLOW', 'Owner A retains master-cash access');
    await check(getDoc(doc(ownerA, 'tenants', TENANT_A, 'staff_accounts', CASHIER_A_STAFF_ID)), 'ALLOW', 'Owner A can read staff_accounts in own tenant');
    await check(deleteDoc(doc(ownerA, 'tenants', TENANT_A, 'sales', 'sale_001')), 'ALLOW', 'Owner A can delete/void sales in own tenant');
    await check(setDoc(doc(ownerA, 'business_codes', 'ALPHA999'), { tenantId: TENANT_A }), 'ALLOW', 'Owner A can register business code');
    await check(getDoc(doc(ownerA, 'staff_usernames', 'cashier_a')), 'ALLOW', 'Owner A retains authorized username-reservation access');
  }

  await testEnv.cleanup();

  console.log('\n================================================================');
  console.log(`  EMULATOR RULES SUITE: TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmulatorRulesSuite().catch(err => {
  console.error('Emulator rules test failed with error:', err);
  if (testEnv) testEnv.cleanup();
  process.exit(1);
});
