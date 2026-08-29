import { execSync, spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout as setTimeoutFn } from 'node:timers/promises';
import { request } from 'node:http';

console.log(`\n======================================================`);
console.log(`  BENTA SNAP LOCAL AUTOMATED VERIFICATION GATE`);
console.log(`======================================================\n`);

type StepResult = 'PASS' | 'FAIL';
const results = new Map<string, StepResult>();

function runStep(name: string, cmd: string, env?: NodeJS.ProcessEnv): boolean {
  console.log(`>>> EXECUTING GATE: ${name}`);
  let passed = false;
  try {
    execSync(cmd, { stdio: 'inherit', env: env ?? process.env, cwd: process.cwd() });
    passed = true;
  } catch {
    passed = false;
  }
  const result: StepResult = passed ? 'PASS' : 'FAIL';
  results.set(name, result);
  if (passed) {
    console.log(`\x1b[32m[PASS] ${name}\x1b[0m\n`);
  } else {
    console.error(`\x1b[31m[FAIL] ${name}\x1b[0m\n`);
  }
  return passed;
}

function findPidOnPort(port: number): number | null {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`,
      { encoding: 'utf8' }
    ).trim();
    const pid = parseInt(out, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function killProcessTree(pid: number): void {
  try {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'pipe' });
  } catch {
  }
}

async function checkHealthy(port: number, path: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const req = request(
      { host: 'localhost', port, path, method: 'GET', timeout: 5000 },
      (res) => {
        res.on('end', () => resolve(res.statusCode === 200));
        res.on('error', () => resolve(false));
        res.resume();
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitForServer(port: number): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    try {
      const loginOk = await checkHealthy(port, '/login');
      const cssOk = await checkHealthy(port, '/_next/static/css/app/layout.css');
      if (loginOk && cssOk) {
        console.log(`>>> Server healthy: /login=200, layout.css=200`);
        return true;
      }
    } catch {
    }
    await setTimeoutFn(1000);
  }
  return false;
}

function scrubElectronEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result = { ...env };
  for (const key of Object.keys(result)) {
    if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') {
      delete result[key];
    }
  }
  return result;
}

async function main() {
  const port = 9002;
  let serverPid: number | null = null;

  try {
    runStep('1. Benta Unit Test Suites (39 suites)', 'npx tsx scripts/run-benta-unit-tests.ts');
    runStep('2. Benta Emulator Test Suites (17 suites)', 'npx tsx scripts/run-benta-emulator-tests.ts');
    runStep('3. TypeScript Typecheck (tsc --noEmit)', 'npm run typecheck');

    const existingPid = findPidOnPort(port);
    if (existingPid) {
      console.log(`\n>>> ERROR: Port ${port} is already in use by PID ${existingPid}`);
      console.log(`>>> Please stop that process before running verification.\n`);
      process.exitCode = 1;
      return;
    }

    runStep('4. Next.js Production Build (next build)', 'npm run build');

    console.log(`\n>>> Starting Next.js dev server on port ${port} for Cypress tests`);
    const isWindows = process.platform === 'win32';
    const serverCommand = isWindows
      ? process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
      : 'npm';
    const serverArgs = isWindows
      ? ['/d', '/s', '/c', 'npm run dev']
      : ['run', 'dev'];

    const serverProc: ChildProcessWithoutNullStreams = spawn(serverCommand, serverArgs, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      windowsHide: true,
    });

    serverProc.stdout.on('data', (d: Buffer) => process.stdout.write(`[dev] ${d.toString()}`));
    serverProc.stderr.on('data', (d: Buffer) => process.stderr.write(`[dev] ${d.toString()}`));

    let spawnSucceeded = false;
    serverProc.on('error', (err) => {
      console.error(`\x1b[31m[FAIL] Failed to spawn dev server: ${err.message}\x1b[0m\n`);
    });

    if (typeof serverProc.pid === 'number') {
      serverPid = serverProc.pid;
      spawnSucceeded = true;
    }

    if (!spawnSucceeded) {
      console.error(`\x1b[31m[FAIL] Dev server process failed to start\x1b[0m\n`);
      results.set('5. Cypress: Staff Access Security Phase 1', 'FAIL');
      results.set('6. Cypress: Secure Benta Cashier UI Lifecycle Suite', 'FAIL');
    } else {
      console.log(`>>> Waiting for server health at http://localhost:${port}/login and /_next/static/css/app/layout.css`);
      const healthy = await waitForServer(port);

      if (!healthy) {
        console.error(`\x1b[31m[FAIL] Dev server did not become healthy\x1b[0m\n`);
        results.set('5. Cypress: Staff Access Security Phase 1', 'FAIL');
        results.set('6. Cypress: Secure Benta Cashier UI Lifecycle Suite', 'FAIL');
      } else {
        const cypressEnv = scrubElectronEnv(process.env);

        runStep('5. Cypress: Staff Access Security Phase 1', 'npx cypress run --spec cypress/e2e/staff-access-security-phase-1.cy.ts', cypressEnv);
        runStep('6. Cypress: Secure Benta Cashier UI Lifecycle Suite', 'npx cypress run --spec cypress/e2e/secure-benta-cashier.cy.ts', cypressEnv);
      }
    }

    runStep('7. Git Diff Whitespace & Hygiene Check', 'git diff --check');
  } finally {
    if (serverPid !== null) {
      console.log(`\n>>> Stopping verifier-owned dev server (PID ${serverPid})`);
      killProcessTree(serverPid);
    }
  }

  console.log(`\n======================================================`);
  console.log(`  VERIFICATION RESULTS`);
  console.log(`======================================================\n`);
  const order = [
    '1. Benta Unit Test Suites (39 suites)',
    '2. Benta Emulator Test Suites (17 suites)',
    '3. TypeScript Typecheck (tsc --noEmit)',
    '4. Next.js Production Build (next build)',
    '5. Cypress: Staff Access Security Phase 1',
    '6. Cypress: Secure Benta Cashier UI Lifecycle Suite',
    '7. Git Diff Whitespace & Hygiene Check',
  ];
  for (const name of order) {
    const result = results.get(name) ?? 'FAIL';
    const label = result === 'PASS' ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
    console.log(`${label} ${name}`);
  }
  console.log(`\n======================================================\n`);

  const anyFailed = [...results.values()].some(r => r === 'FAIL');
  if (anyFailed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});