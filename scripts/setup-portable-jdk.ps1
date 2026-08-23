$toolsDir = Join-Path (Get-Location).Path ".tools"
if (!(Test-Path $toolsDir)) {
    New-Item -ItemType Directory -Path $toolsDir | Out-Null
}

$zipPath = Join-Path $toolsDir "temurin17-jre.zip"
$jreDest = Join-Path $toolsDir "jre17"

if (!(Test-Path $jreDest)) {
    Write-Host "Downloading Eclipse Temurin 17 JRE (43MB)..."
    curl.exe -L -o $zipPath "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jre/hotspot/normal/eclipse"
    
    Write-Host "Extracting Temurin 17 JRE..."
    Expand-Archive -Path $zipPath -DestinationPath $jreDest -Force
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
}

$javaExe = Get-ChildItem -Path $jreDest -Filter "java.exe" -Recurse | Select-Object -First 1 -ExpandProperty FullName
if ($javaExe) {
    Write-Host "Java executable found at: $javaExe"
    & $javaExe -version
    $binDir = Split-Path $javaExe -Parent
    $javaHome = Split-Path $binDir -Parent
    Write-Host "JAVA_HOME: $javaHome"
    
    # Export for current environment
    $env:JAVA_HOME = $javaHome
    $env:PATH = "$binDir;$env:PATH"
} else {
    Write-Error "java.exe not found in $jreDest"
}
