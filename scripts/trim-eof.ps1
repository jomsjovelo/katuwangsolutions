$content = [System.IO.File]::ReadAllText('src\app\sw.ts')
$trimmed = $content.TrimEnd()
[System.IO.File]::WriteAllText((Resolve-Path 'src\app\sw.ts').Path, $trimmed + "`n")
Write-Host "Done. Lines: $((Get-Content 'src\app\sw.ts').Count)"
