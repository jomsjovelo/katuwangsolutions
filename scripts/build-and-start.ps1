$env:NEXT_PUBLIC_USE_FIREBASE_EMULATOR = "true"
$env:NEXT_PUBLIC_FIREBASE_API_KEY = "demo-api-key"
$env:NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-katuwang-offline-test"
$env:GCLOUD_PROJECT = "demo-katuwang-offline-test"
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
$env:STAFF_PIN_PEPPER_V1 = "local_dev_pepper_v1_12345"
$env:OFFLINE_GRANT_HMAC_SECRET_V1 = "local_grant_secret_v1_12345"
$env:WEBAUTHN_CHALLENGE_HMAC_SECRET_V1 = "local_webauthn_secret_v1_12345"
$env:WEBAUTHN_ORIGIN = "http://localhost:9002"
$env:WEBAUTHN_RP_ID = "localhost"
$env:BENTA_CASHIER_CHECKOUT_ENABLED = "true"
$env:BENTA_CASHIER_OFFLINE_ENABLED = "true"
$env:BENTA_CASHIER_HYBRID_ENABLED = "true"
$env:NEXT_PUBLIC_BENTA_CASHIER_HYBRID_ENABLED = "true"
$env:RATE_LIMIT_HMAC_SECRET = "local_dev_rate_limit_secret_v1_1234567890"

Write-Host "Building Next.js production bundle..."
npx next build

Write-Host "Starting Next.js on port 9002..."
npx next start -p 9002
