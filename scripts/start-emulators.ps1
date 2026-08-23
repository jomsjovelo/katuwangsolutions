$jdkBin = Join-Path (Get-Location).Path ".tools\jre17\jdk-17.0.20+8-jre\bin"
$jdkHome = Join-Path (Get-Location).Path ".tools\jre17\jdk-17.0.20+8-jre"

$env:PATH = "$jdkBin;$env:PATH"
$env:JAVA_HOME = $jdkHome

npx firebase emulators:start --only auth,firestore --project demo-katuwang-offline-test
