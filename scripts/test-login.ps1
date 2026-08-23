$body = '{"businessCode":"0VGY66O","username":"democashier2","pin":"0147"}'
$r = Invoke-WebRequest -Uri 'http://localhost:9002/api/auth/staff-pin-login' -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing
Write-Host 'Status:' $r.StatusCode
Write-Host 'Body:' $r.Content
