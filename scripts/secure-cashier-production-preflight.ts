import {
  analyzeSecureCashierCompatibility,
  assertProductionPreflightAuthorized,
  collectBentaPreflightScopes
} from '../src/lib/server/secure-cashier-production-preflight';

async function main() {
  const projectId = assertProductionPreflightAuthorized(process.argv.slice(2), process.env);
  const firebaseAdmin = await import('firebase-admin');
  const app = firebaseAdmin.apps.length ? firebaseAdmin.app() : firebaseAdmin.initializeApp({ projectId });
  if (app.options.projectId !== projectId) throw new Error('SECURITY_FAIL_CLOSED: Admin SDK project mismatch');
  const db = firebaseAdmin.firestore(app);
  const tenants = await collectBentaPreflightScopes(db);
  console.log(JSON.stringify(analyzeSecureCashierCompatibility({ tenants }), null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'SECURITY_FAIL_CLOSED');
  process.exitCode = 1;
});
