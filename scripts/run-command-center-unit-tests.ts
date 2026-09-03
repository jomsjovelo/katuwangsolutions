import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');

const tests = [
  'test/master-admin-authorization.test.ts',
  'test/command-center-stats.test.ts',
];

let passed = 0;
const failed: string[] = [];

for (const testFile of tests) {
  process.stdout.write(`RUNNING: ${testFile} ... `);
  try {
    execFileSync(process.execPath, [tsxCli, testFile], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' },
    });
    console.log('PASS');
    passed += 1;
  } catch (error: any) {
    console.log('FAIL');
    if (error.stdout) console.error(error.stdout.toString());
    if (error.stderr) console.error(error.stderr.toString());
    failed.push(testFile);
  }
}

console.log(`COMMAND CENTER UNIT TEST RESULTS: ${passed} PASSED, ${failed.length} FAILED`);
if (failed.length > 0) {
  failed.forEach((testFile) => console.error(` - ${testFile}`));
  process.exit(1);
}
