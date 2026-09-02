import { execSync } from 'node:child_process';

const bentaUnitTests = [
  'test/benta-snap-consolidation.test.ts',
  'test/benta-checkout-measured.test.ts',
  'test/benta-cashier-checkout.test.ts',
  'test/benta-cashier-checkout-route.test.ts',
  'test/benta-cashier-bootstrap.test.ts',
  'test/benta-cashier-bootstrap-route.test.ts',
  'test/benta-cashier-shift-open.test.ts',
  'test/benta-cashier-shift-open-route.test.ts',
  'test/benta-cashier-shift-receipt.test.ts',
  'test/benta-cashier-shift-receipt-route.test.ts',
  'test/benta-cashier-vertical-slice.test.ts',
  'test/smart-pricing.test.ts',
  'test/cashier-logout.test.ts',
  'test/cashier-profile-logout-dialog.test.ts',
  'test/cashier-profile-subscription.test.ts',
  'test/cashier-bootstrap-reconciliation.test.ts',
  'test/finalization-predicate.test.ts',
  'test/firebase-persistence-marker.test.ts',
  'test/staff-logout-handler.test.ts',
  'test/staff-logout-route.test.ts',
  'test/staff-auth-rate-limiter.test.ts',
  'test/staff-pin-auth-integration.test.ts',
  'test/staff-request-admission.test.ts',
  'test/staff-security-behavioral.test.ts',
  'test/secure-benta-cashier-client.test.ts',
  'test/catalog-snapshot-service.test.ts',
  'test/demo-boundary.test.ts',
  'test/webauthn-server-service.test.ts',
  'test/webauthn-client-verifier.test.ts',
  'test/variable-quantity.test.ts',
  'test/owner-cashier-lifecycle.test.ts',
  'test/owner-cashier-routes.test.ts',
  'test/owner-retail-pnl.test.ts',
  'test/owner-tenant-authorization.test.ts',
  'test/owner-transition-shiftgate.test.ts',
  'test/thermal-receipt-jpg.test.ts',
  'test/offline-grant-signer.test.ts',
  'test/benta-sync-claims-handler.test.ts',
  'test/journal-db.test.ts',
  'test/shared-inventory-costing.test.ts',
  'test/benta-inventory-costing-adapter.test.ts',
  'test/benta-inventory-restock.test.ts',
  'test/benta-smart-restocking-integration.test.ts',
  'test/benta-smart-po-protection.test.ts',
  'test/benta-exact-pool-sales-consumption.test.ts',
  'test/benta-sale-mutation-guard.test.ts',
  'test/benta-sale-reversal-engine.test.ts',
  'test/benta-restock-reversal-engine.test.ts',
  'test/benta-sale-reversal.test.ts',
  'test/benta-restock-reversal.test.ts',
  'test/benta-sale-reversal-client.test.ts',
  'test/benta-sale-reversal-ui-behavior.test.ts',
  'test/benta-restock-reversal-client.test.ts',
  'test/benta-restock-reversal-ui-behavior.test.ts',
  'test/benta-void-report-aggregation.test.ts',
];

console.log(`\n======================================================`);
console.log(`  BENTA SNAP REPEATABLE UNIT TEST RUNNER (${bentaUnitTests.length} SUITES)`);
console.log(`======================================================\n`);

let passedCount = 0;
let failedCount = 0;
const failedSuites: string[] = [];

for (const testFile of bentaUnitTests) {
  process.stdout.write(`RUNNING: ${testFile} ... `);
  try {
    execSync(`npx tsx ${testFile}`, {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' }
    });
    console.log(`\x1b[32mPASS\x1b[0m`);
    passedCount++;
  } catch (err: any) {
    console.log(`\x1b[31mFAIL\x1b[0m`);
    console.error(`\n--- ERROR OUTPUT FOR ${testFile} ---`);
    if (err.stdout) console.error(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
    console.error(`---------------------------------------\n`);
    failedCount++;
    failedSuites.push(testFile);
  }
}

console.log(`\n======================================================`);
console.log(`  BENTA UNIT TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
console.log(`======================================================\n`);

if (failedCount > 0) {
  console.error(`FAILED SUITES:`);
  failedSuites.forEach(s => console.error(` - ${s}`));
  process.exit(1);
} else {
  console.log(`All ${passedCount} Benta unit test suites passed successfully.`);
  process.exit(0);
}
