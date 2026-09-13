# Re-establish the USB tunnels the phone needs to reach the local services.
#
# The wallet is built with ISSUER_BASE_URL=http://127.0.0.1:3000, which only
# works while `adb reverse` is forwarding the phone's localhost to this PC.
# `adb reverse` mappings are cleared whenever the adb server restarts or the
# USB cable is reconnected, which makes the wallet fail with
# "failed to connect to /127.0.0.1:<port>". Run this script after any reconnect.
#
# Usage:  pwsh -File scripts/phone-connect.ps1

param(
    [int[]]$Ports = @(3000, 3001, 3002, 3003, 3004, 3007)
)

$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { $adb = 'adb' }

$devices = & $adb devices | Select-String '\sdevice$'
if (-not $devices) {
    Write-Error 'No Android device detected. Connect the phone over USB and enable USB debugging.'
    exit 1
}

foreach ($port in $Ports) {
    & $adb reverse "tcp:$port" "tcp:$port" | Out-Null
}

Write-Host 'Reverse tunnels:' -ForegroundColor Cyan
& $adb reverse --list

# Verify the issuer is actually reachable from the phone.
$code = (& $adb shell "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/health") -join ''
if ($code -eq '200') {
    Write-Host 'Phone -> issuer OK (HTTP 200)' -ForegroundColor Green
} else {
    Write-Warning "Phone could not reach the issuer (got '$code'). Is the issuer service running on port 3000?"
}
