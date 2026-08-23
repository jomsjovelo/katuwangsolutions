$jdkBin = Join-Path (Get-Location).Path ".tools\jre17\jdk-17.0.20+8-jre\bin"
$jdkHome = Join-Path (Get-Location).Path ".tools\jre17\jdk-17.0.20+8-jre"

$env:PATH = "$jdkBin;$env:PATH"
$env:JAVA_HOME = $jdkHome
$env:NEXT_PUBLIC_USE_FIREBASE_EMULATOR = "true"
$env:NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-katuwang-offline-test"
$env:GCLOUD_PROJECT = "demo-katuwang-offline-test"
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
$env:STAFF_PIN_PEPPER_V1 = "local_dev_pepper_v1_12345"
$env:OFFLINE_GRANT_HMAC_SECRET_V1 = "local_grant_secret_v1_12345"
$env:WEBAUTHN_CHALLENGE_HMAC_SECRET_V1 = "local_webauthn_secret_v1_12345"

npx tsx --test test/benta-sync-claims.emulator.test.ts
