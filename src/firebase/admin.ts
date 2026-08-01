import * as admin from 'firebase-admin';

export const getAdminAuth = () => {
  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-5538116689-bdfb2',
          clientEmail: process.env.ADMIN_CLIENT_EMAIL,
          // Handle escaped newlines in the private key string from env
          privateKey: process.env.ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
      console.log('Firebase Admin SDK initialized successfully.');
    } catch (error) {
      console.error('Firebase Admin SDK initialization error:', error);
    }
  }
  return admin.auth();
};
