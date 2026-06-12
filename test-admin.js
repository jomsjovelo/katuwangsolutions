
const admin = require('firebase-admin');
const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\\\n/g, '\n')
  })
});

const db = admin.firestore();
async function run() {
  const users = await db.collection('users').where('email', '==', 'demo@katuwangsolutions.com').get();
  if (users.empty) {
    console.log('User not found!');
    process.exit(1);
  }
  const user = users.docs[0];
  console.log('User Data:', user.data());
  const tenantId = user.data().tenantId;
  
  if (tenantId) {
    const tenant = await db.collection('tenants').doc(tenantId).get();
    console.log('Tenant exists:', tenant.exists);
    if (tenant.exists) {
      console.log('Tenant Data:', tenant.data());
    }
  }
  process.exit(0);
}
run();

