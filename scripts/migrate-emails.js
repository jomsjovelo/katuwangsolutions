const admin = require('firebase-admin');
// Initialize with application default credentials
admin.initializeApp({
  projectId: 'studio-5538116689-bdfb2'
});

const db = admin.firestore();

async function migrateMissingEmails() {
  console.log('Starting migration for missing tenant emails and searchable names...');
  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    const tenantsRef = db.collection('tenants');
    const snapshot = await tenantsRef.get();

    if (snapshot.empty) {
      console.log('No tenants found in the database.');
      return;
    }

    console.log(`Found ${snapshot.size} tenants. Checking for missing fields...`);

    // We process in small batches to avoid hitting rate limits or memory issues
    const batch = db.batch();
    let currentBatchSize = 0;
    
    // We cache users to avoid redundant lookups if one user owns many tenants
    const userCache = new Map();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const needsEmail = !data.ownerEmail;
      const needsSearchableName = !data.searchableName;

      if (needsEmail || needsSearchableName) {
        try {
          const updates = {};
          
          if (needsEmail && data.ownerUid) {
            let email = userCache.get(data.ownerUid);
            if (!email) {
              const userSnap = await db.collection('users').doc(data.ownerUid).get();
              if (userSnap.exists) {
                email = userSnap.data().email;
                if (email) userCache.set(data.ownerUid, email);
              }
            }
            if (email) {
              updates.ownerEmail = email;
            } else {
              console.log(`Warning: Tenant ${doc.id} has ownerUid ${data.ownerUid} but no user/email found.`);
              updates.ownerEmail = 'unknown@example.com'; // fallback
            }
          }

          if (needsSearchableName && data.name) {
            updates.searchableName = data.name.toLowerCase();
          }

          if (Object.keys(updates).length > 0) {
            batch.update(doc.ref, updates);
            currentBatchSize++;
            migratedCount++;

            // Commit batch if it reaches 400 (Firestore limit is 500)
            if (currentBatchSize >= 400) {
              await batch.commit();
              console.log(`Committed batch of ${currentBatchSize} updates.`);
              currentBatchSize = 0;
            }
          } else {
             skippedCount++;
          }
        } catch (e) {
          console.error(`Error processing tenant ${doc.id}:`, e);
          errorCount++;
        }
      } else {
        skippedCount++;
      }
    }

    // Commit any remaining updates
    if (currentBatchSize > 0) {
      await batch.commit();
      console.log(`Committed final batch of ${currentBatchSize} updates.`);
    }

    console.log('\n--- Migration Summary ---');
    console.log(`Total Tenants Checked: ${snapshot.size}`);
    console.log(`Tenants Migrated: ${migratedCount}`);
    console.log(`Tenants Skipped (Already OK): ${skippedCount}`);
    console.log(`Errors Encountered: ${errorCount}`);
    console.log('-------------------------');

  } catch (error) {
    console.error('Migration failed with a critical error:', error);
  }
}

migrateMissingEmails()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
