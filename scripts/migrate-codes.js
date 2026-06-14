const admin = require('firebase-admin');

// Initialize with application default credentials
admin.initializeApp({
  projectId: 'studio-5538116689-bdfb2'
});

async function generateUnique7CharCode(db) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let isUnique = false;
  let code = '';
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    code = Array.from({ length: 7 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    
    // Check both collections to ensure absolute uniqueness across the system
    const businessDoc = await db.collection('business_codes').doc(code).get();
    const referralDoc = await db.collection('referral_codes').doc(code).get();

    if (!businessDoc.exists && !referralDoc.exists) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error('Could not generate a unique code.');
  }

  return code;
}

async function migrateCodes() {
  const db = admin.firestore();
  
  console.log('--- Starting Migration to Unified 7-Char Codes ---');

  // 1. Fetch all tenants (Store Owners)
  const tenantsSnap = await db.collection('tenants').get();
  console.log(`Found ${tenantsSnap.size} tenants to process.`);

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    const tenantData = tenantDoc.data();
    const oldBusinessCode = tenantData.businessCode;
    const ownerUid = tenantData.ownerUid;

    if (oldBusinessCode && oldBusinessCode.length === 7) {
      console.log(`Tenant ${tenantData.businessName} already has a 7-char code. Skipping.`);
      continue;
    }

    // Generate new unified code
    const unifiedCode = await generateUnique7CharCode(db);
    console.log(`Migrating Tenant: ${tenantData.businessName} | Old: ${oldBusinessCode} -> New: ${unifiedCode}`);

    const batch = db.batch();

    // Delete old business code if it exists
    if (oldBusinessCode) {
      batch.delete(db.collection('business_codes').doc(oldBusinessCode));
    }

    // Set new business code document
    batch.set(db.collection('business_codes').doc(unifiedCode), {
      tenantId: tenantId,
      businessName: tenantData.businessName || '',
      moduleType: tenantData.moduleType || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update tenant document
    batch.update(db.collection('tenants').doc(tenantId), {
      businessCode: unifiedCode,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // --- Now handle the Owner's Referral Code ---
    if (ownerUid) {
      const userRef = db.collection('users').doc(ownerUid);
      const userDoc = await userRef.get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        const oldReferralCode = userData.referralCode;

        if (oldReferralCode) {
          batch.delete(db.collection('referral_codes').doc(oldReferralCode));
        }

        // Create new referral code document
        batch.set(db.collection('referral_codes').doc(unifiedCode), {
          uid: ownerUid,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update user document
        batch.update(userRef, {
          referralCode: unifiedCode,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    await batch.commit();
    console.log(`✓ Completed tenant ${tenantData.businessName}`);
  }

  // 2. Fetch all users to catch Staff members (who don't own tenants)
  console.log('\n--- Processing Staff/Remaining Users ---');
  const usersSnap = await db.collection('users').get();
  
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const userData = userDoc.data();
    const oldReferralCode = userData.referralCode;

    // If it's an owner, we already updated them in the tenant loop, so their code should be 7 chars now
    if (!oldReferralCode || oldReferralCode.length === 7) {
      continue;
    }

    // This is likely a staff member with a 4-char or 6-char referral code
    const newRefCode = await generateUnique7CharCode(db);
    console.log(`Migrating Staff/User: ${userData.email} | Old: ${oldReferralCode} -> New: ${newRefCode}`);

    const batch = db.batch();

    // Delete old
    batch.delete(db.collection('referral_codes').doc(oldReferralCode));
    
    // Set new
    batch.set(db.collection('referral_codes').doc(newRefCode), {
      uid: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update user
    batch.update(db.collection('users').doc(uid), {
      referralCode: newRefCode,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    console.log(`✓ Completed user ${userData.email}`);
  }

  console.log('\n--- Migration Complete! ---');
}

migrateCodes().catch(console.error);
