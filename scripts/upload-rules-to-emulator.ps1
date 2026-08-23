$rulesContent = Get-Content -Path "firestore.rules" -Raw
$payload = ConvertTo-Json -Depth 10 -InputObject @{
    rules = @{
        files = @(@{
            name = "firestore.rules"
            content = $rulesContent
        })
    }
}
$result = Invoke-RestMethod -Method PUT -Uri "http://127.0.0.1:8080/emulator/v1/projects/demo-katuwang-offline-test/firestore/rules" -ContentType "application/json" -Body $payload
Write-Host "Rules uploaded: $($result | ConvertTo-Json)"
