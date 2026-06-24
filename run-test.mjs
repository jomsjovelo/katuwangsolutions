// run-test.mjs
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// Client config (safe to expose in public frontend)
const firebaseConfig = {
  apiKey: "demo-key",
  authDomain: "demo.firebaseapp.com",
  projectId: "studio-5538116689-bdfb2", // From the deployment log
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  try {
    const q = query(
      collection(db, 'users'),
      where('approvalStatus', '==', 'pending')
    );
    // Since we don't have auth, this will probably fail if rules are strict.
    // Wait, let's use the firebase admin sdk which bypasses rules to see if the data ACTUALLY EXISTS!
  } catch(e) {
    console.error(e);
  }
}
check();
