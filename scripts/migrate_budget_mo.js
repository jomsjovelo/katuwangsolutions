const admin = require('firebase-admin');
const dotenv = require('dotenv');
dotenv.config({ path: '../.env' }); // Adjusted for scripts/ directory

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
});

const db = admin.firestore();

async function run() {
  console.log('Starting migration from budget-sense to budget-mo...');
  
  // Update all tenants with moduleType 'budget-sense'
  const tenants = await db.collection('tenants').where('moduleType', '==', 'budget-sense').get();
  
  if (tenants.empty) {
    console.log('No tenants found with moduleType "budget-sense". Migration complete.');
    process.exit(0);
  }

  const batch = db.batch();
  let count = 0;

  tenants.forEach(doc => {
    batch.update(doc.ref, { moduleType: 'budget-mo' });
    count++;
  });

  await batch.commit();
  console.log(`Migration successful! Updated ${count} tenants to moduleType "budget-mo".`);
  process.exit(0);
}

run().catch(console.error);
