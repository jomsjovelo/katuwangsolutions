import { execSync } from 'node:child_process';

const tsekInTests = [
  'test/tsek-in-domain.test.ts',
  'test/tsek-in-checkin-service.test.ts',
  'test/tsek-in-checkout-service.test.ts',
  'test/tsek-in-extension-service.test.ts',
  'test/tsek-in-api-routes.test.ts',
  'test/tsek-in-client.test.ts',
  'test/tsek-in-checkin-ui-integration.test.ts',
  'test/tsek-in-manage-stay-ui-integration.test.ts',
  'test/tsek-in-admin-service.test.ts',
  'test/app-marketplace-catalog.test.ts',
];

console.log(`\n======================================================`);
console.log(`  TSEK-IN DOMAIN TEST RUNNER (${tsekInTests.length} SUITE)`);
console.log(`======================================================\n`);

let passedCount = 0;
let failedCount = 0;
const failedSuites: string[] = [];

for (const testFile of tsekInTests) {
  process.stdout.write(`RUNNING: ${testFile} ... `);
  try {
    execSync(`npx tsx ${testFile}`, {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' },
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
console.log(`  TSEK-IN RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
console.log(`======================================================\n`);

if (failedCount > 0) {
  console.error(`FAILED SUITES:`);
  failedSuites.forEach(s => console.error(` - ${s}`));
  process.exit(1);
} else {
  console.log(`All ${passedCount} Tsek-In test suite passed successfully.`);
  process.exit(0);
}
