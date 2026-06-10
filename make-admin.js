const admin = require('firebase-admin');

// Initialize with application default credentials
admin.initializeApp({
  projectId: 'studio-5538116689-bdfb2'
});

async function makeAdmin() {
  const db = admin.firestore();
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  
  if (snapshot.empty) {
    console.log('No matching documents.');
    return;
  }  

  snapshot.forEach(async doc => {
    console.log(doc.id, '=>', doc.data());
    // Add all users to admins collection for now
    await db.collection('admins').doc(doc.id).set({
      role: 'Master Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Made ${doc.data().email} an admin!`);
  });
}

makeAdmin().catch(console.error);
