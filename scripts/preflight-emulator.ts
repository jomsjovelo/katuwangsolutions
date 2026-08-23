import net from 'node:net';
import { spawnSync } from 'node:child_process';

interface DiagnosticResult {
  passed: boolean;
  name: string;
  detail: string;
}

function checkPort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(400);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

export async function runPreflightDiagnostics(): Promise<{ passed: boolean; results: DiagnosticResult[] }> {
  const results: DiagnosticResult[] = [];

  // 1. Emulator Switch & Demo Project
  const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
  const isDemo = projectId.startsWith('demo-');

  results.push({
    name: 'Emulator Switch',
    passed: useEmulator,
    detail: useEmulator
      ? 'NEXT_PUBLIC_USE_FIREBASE_EMULATOR is enabled'
      : 'NEXT_PUBLIC_USE_FIREBASE_EMULATOR is NOT "true"'
  });

  results.push({
    name: 'Demo Project Isolation',
    passed: isDemo,
    detail: isDemo
      ? `Project ID '${projectId}' starts with 'demo-'`
      : `Project ID '${projectId}' does NOT start with 'demo-'. Production fallback prohibited.`
  });

  // 2. Java Runtime on PATH
  let javaAvailable = false;
  let javaVersion = '';
  try {
    const javaCheck = spawnSync('java', ['-version'], { encoding: 'utf8' });
    if (javaCheck.status === 0 || javaCheck.stderr || javaCheck.stdout) {
      const output = (javaCheck.stderr || javaCheck.stdout || '').trim().split('\n')[0];
      if (output.toLowerCase().includes('version') || output.toLowerCase().includes('openjdk') || output.toLowerCase().includes('java')) {
        javaAvailable = true;
        javaVersion = output;
      }
    }
  } catch {
    javaAvailable = false;
  }

  results.push({
    name: 'Java Runtime (JRE/JDK)',
    passed: javaAvailable,
    detail: javaAvailable
      ? `Java found: ${javaVersion}`
      : 'Java is not installed on system PATH. Firebase Emulator Suite requires OpenJDK/JRE.'
  });

  // 3. Local Test Secrets
  const pepperVersion = process.env.STAFF_PIN_PEPPER_ACTIVE_VERSION || 'v1';
  const pepperSecret = process.env[`STAFF_PIN_PEPPER_${pepperVersion.toUpperCase()}`] || process.env.STAFF_PIN_PEPPER_V1;
  const grantKey = process.env.OFFLINE_GRANT_HMAC_SECRET_V1;
  const webauthnSecret = process.env.WEBAUTHN_CHALLENGE_HMAC_SECRET_V1;
  const adminPassword = process.env.LOCAL_MASTER_ADMIN_PASSWORD;
  const secretsPresent = !!pepperSecret && !!grantKey && !!webauthnSecret && !!adminPassword;

  results.push({
    name: 'Local Test Secrets & Admin Credentials',
    passed: secretsPresent,
    detail: secretsPresent
      ? 'STAFF_PIN_PEPPER_V1, OFFLINE_GRANT_HMAC_SECRET_V1, WEBAUTHN_CHALLENGE_HMAC_SECRET_V1, and LOCAL_MASTER_ADMIN_PASSWORD configured in local environment'
      : 'Missing local uncommitted test secrets or admin credential (LOCAL_MASTER_ADMIN_PASSWORD, STAFF_PIN_PEPPER_V1, etc.).'
  });

  // 4. Emulator Ports (8080 Firestore, 9099 Auth)
  const firestoreActive = await checkPort('127.0.0.1', 8080);
  const authActive = await checkPort('127.0.0.1', 9099);

  results.push({
    name: 'Firestore Emulator (Port 8080)',
    passed: firestoreActive,
    detail: firestoreActive ? 'Listening at 127.0.0.1:8080' : 'Unreachable at 127.0.0.1:8080'
  });

  results.push({
    name: 'Auth Emulator (Port 9099)',
    passed: authActive,
    detail: authActive ? 'Listening at 127.0.0.1:9099' : 'Unreachable at 127.0.0.1:9099'
  });

  const overallPassed = results.every((r) => r.passed);
  return { passed: overallPassed, results };
}

// Direct execution CLI runner
if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.endsWith('preflight-emulator.ts'))) {
  runPreflightDiagnostics().then(({ passed, results }) => {
    console.log('\n=== KATUWANG FIREBASE LOCALHOST EMULATOR PREFLIGHT ===\n');
    for (const r of results) {
      console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.name}: ${r.detail}`);
    }
    console.log(`\nOverall Preflight Status: ${passed ? 'READY' : 'BLOCKED'}\n`);
    if (!passed) {
      process.exit(1);
    }
  });
}
