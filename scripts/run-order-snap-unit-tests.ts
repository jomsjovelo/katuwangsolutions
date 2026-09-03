import { execSync } from 'node:child_process';

const orderSnapUnitTests = [
  'test/order-snap-catalog-endpoint.test.ts',
  'test/order-snap-checkout-route.test.ts',
  'test/order-snap-outbox-db.test.ts',
  'test/order-snap-offline-manager.test.ts',
  'test/order-snap-ingestion.test.ts',
  'test/order-snap-domain.test.ts',
  'test/order-snap-sync-coordinator.test.ts',
  'test/order-snap-smart-pricing.test.ts',
  'test/order-snap-smart-pricing-ui.test.ts',
  'test/order-snap-authority.test.ts',
  'test/order-snap/order-snap-controller.test.ts',
  'test/order-snap/order-snap-controller-failclosed.test.ts',
  'test/order-snap/order-snap-controller-lifecycle.test.ts',
  'test/order-snap/order-snap-controller-logout.test.ts',
  'test/order-snap/order-snap-controller-init-failure.test.ts',
  'test/order-snap/order-snap-lifecycle-foundation.test.ts',
  'test/order-snap-timpla-cash-checkout-adapter.test.ts',
  'test/order-snap-public-module-consolidation.test.ts',
  'test/order-snap-report-isolation.test.ts',
  'test/shared-inventory-costing.test.ts',
];

console.log(`\n======================================================`);
console.log(`  ORDER SNAP UNIT TEST RUNNER (${orderSnapUnitTests.length} SUITES)`);
console.log(`======================================================\n`);

let passedCount = 0;
let failedCount = 0;
const failedSuites: string[] = [];

for (const testFile of orderSnapUnitTests) {
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
console.log(`  ORDER SNAP UNIT TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
console.log(`======================================================\n`);

if (failedCount > 0) {
  console.error(`FAILED SUITES:`);
  failedSuites.forEach(s => console.error(` - ${s}`));
  process.exit(1);
} else {
  console.log(`All ${passedCount} Order Snap unit test suites passed successfully.`);
  process.exit(0);
}