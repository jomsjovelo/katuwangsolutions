import * as admin from 'firebase-admin';

export const getAdminApp = () => {
  if (!admin.apps.length) {
    const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-5538116689-bdfb2';

    if (useEmulator) {
      if (!projectId.startsWith('demo-')) {
        throw new Error(`[SECURITY_FAIL_CLOSED] Emulator mode refused: Project ID '${projectId}' must start with 'demo-'.`);
      }
      process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
      process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
      admin.initializeApp({ projectId });
      console.info(`[FIREBASE_ADMIN_EMULATOR] Initialized Admin SDK for demo project '${projectId}' at ${process.env.FIRESTORE_EMULATOR_HOST}`);
      return admin.app();
    }

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
  return admin.app();
};

export const getAdminAuth = () => {
  getAdminApp();
  return admin.auth();
};

export const getAdminFirestore = () => {
  getAdminApp();
  return admin.firestore();
};
