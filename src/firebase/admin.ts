import * as admin from 'firebase-admin';

export const getAdminAuth = () => {
  if (!admin.apps.length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-5538116689-bdfb2';
    const clientEmail = process.env.ADMIN_CLIENT_EMAIL?.trim();
    const privateKey = process.env.ADMIN_PRIVATE_KEY?.trim()?.replace(/\\n/g, '\n');

    if (clientEmail && privateKey) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        console.log('Firebase Admin SDK initialized with cert.');
      } catch (error) {
        console.error('Firebase Admin cert initialization error:', error);
      }
    }

    if (!admin.apps.length) {
      try {
        admin.initializeApp({ projectId });
        console.log('Firebase Admin SDK initialized with default application credentials.');
      } catch (error) {
        console.error('Firebase Admin SDK default initialization error:', error);
      }
    }
  }
  return admin.auth();
};
