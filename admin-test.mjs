// admin-test.mjs
import admin from 'firebase-admin';

admin.initializeApp({
  projectId: "studio-5538116689-bdfb2",
});

const db = admin.firestore();

async function run() {
  const usersRef = db.collection('users');
  const snap = await usersRef.where('approvalStatus', '==', 'pending').get();
  
  if (snap.empty) {
    console.log("NO PENDING STAFF FOUND IN DATABASE!");
  } else {
    snap.forEach(doc => {
      console.log("PENDING STAFF:", doc.id, doc.data());
    });
  }
}
run();
