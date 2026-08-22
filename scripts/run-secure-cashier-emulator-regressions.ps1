$ErrorActionPreference = 'Stop'

if ($env:GCLOUD_PROJECT -notlike 'demo-*' -or $env:FIRESTORE_EMULATOR_HOST -notmatch '^(127\.0\.0\.1|localhost):\d+$') {
  throw 'SECURITY_FAIL_CLOSED: emulator regression runner requires a loopback emulator and demo project'
}

$tests = @(
  'test\benta-cashier-bootstrap.emulator.test.ts',
  'test\benta-cashier-checkout.emulator.test.ts',
  'test\benta-cashier-shift-open.emulator.test.ts',
  'test\benta-cashier-shift-receipt.emulator.test.ts',
  'test\owner-cashier-lifecycle.emulator.test.ts',
  'test\owner-tenant-authorization.emulator.test.ts',
  'test\staff-logout.emulator.test.ts'
)

foreach ($test in $tests) {
  & .\node_modules\.bin\tsx.cmd $test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

