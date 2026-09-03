import { execSync } from 'node:child_process';

const bentaEmulatorTests = [
  'test/b-hybrid-cash-vertical-slice.emulator.test.ts',
  'test/benta-cashier-checkout-measured.emulator.test.ts',
  'test/benta-cashier-checkout.emulator.test.ts',
  'test/benta-cashier-bootstrap.emulator.test.ts',
  'test/benta-cashier-shift-open.emulator.test.ts',
  'test/benta-cashier-shift-receipt.emulator.test.ts',
  'test/benta-cashier-shift-report.emulator.test.ts',
  'test/benta-sync-claims.emulator.test.ts',
  'test/cash-drawer-accounting.emulator.test.ts',
  'test/firestore-rules.emulator.test.ts',
  'test/measured-inventory-isolated.emulator.test.ts',
  'test/owner-cashier-lifecycle.emulator.test.ts',
  'test/owner-tenant-authorization.emulator.test.ts',
  'test/staff-logout-route.emulator.test.ts',
  'test/staff-logout.emulator.test.ts',
  'test/variable-quantity-vertical-slice.emulator.test.ts',
  'test/master-admin-authorization.emulator.test.ts',
  'test/command-center-authorization.emulator.test.ts'
];

console.log(`\n======================================================`);
console.log(`  BENTA SNAP REPEATABLE EMULATOR TEST RUNNER (${bentaEmulatorTests.length} SUITES)`);
console.log(`======================================================\n`);

// Pre-flight: Java availability
try {
  execSync('java -version', { stdio: 'ignore' });
} catch {
  console.error('[EMULATOR ISOLATION REFUSAL] Java runtime not found. Emulator tests require Java.');
  process.exit(1);
}

// Verify Emulator Host & Loopback Isolation Pre-flight
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

const hostPattern = /^(127\.0\.0\.1|localhost):\d+$/;
if (!hostPattern.test(firestoreHost) || !hostPattern.test(authHost)) {
  console.error(`[EMULATOR ISOLATION REFUSAL] Emulators must point strictly to loopback hosts.`);
  console.error(`FIRESTORE_EMULATOR_HOST=${firestoreHost}`);
  console.error(`FIREBASE_AUTH_EMULATOR_HOST=${authHost}`);
  process.exit(1);
}

let passedCount = 0;
let failedCount = 0;
const failedSuites: string[] = [];

for (const testFile of bentaEmulatorTests) {
  process.stdout.write(`RUNNING: ${testFile} ... `);
  try {
    execSync(`npx tsx ${testFile}`, {
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        FIRESTORE_EMULATOR_HOST: firestoreHost,
        FIREBASE_AUTH_EMULATOR_HOST: authHost
      }
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
console.log(`  BENTA EMULATOR TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
console.log(`======================================================\n`);

if (failedCount > 0) {
  console.error(`FAILED SUITES:`);
  failedSuites.forEach(s => console.error(` - ${s}`));
  process.exit(1);
} else {
  console.log(`All ${passedCount} Benta emulator test suites passed successfully.`);
  process.exit(0);
}
