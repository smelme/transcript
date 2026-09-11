# Keeps the USB tunnels to the phone alive.
#
# `adb reverse` mappings are cleared whenever the adb server restarts or the USB
# cable is reconnected. This watcher re-creates them within a few seconds so the
# wallet never sees "failed to connect to /127.0.0.1:<port>".
#
# Run in its own terminal and leave it running while testing:
#   pwsh -File scripts/phone-tunnel-watch.ps1

param(
    [int[]]$Ports = @(3000, 3001, 3002, 3003, 3004),
    [int]$IntervalSeconds = 5
)

$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { $adb = 'adb' }

Write-Host "Watching USB tunnels for ports $($Ports -join ', ') every ${IntervalSeconds}s. Press Ctrl+C to stop." -ForegroundColor Cyan

$lastState = ''

while ($true) {
    $device = (& $adb get-state 2>$null) -join ''
    if ($device -ne 'device') {
        if ($lastState -ne 'offline') {
            Write-Host "$(Get-Date -Format HH:mm:ss)  phone not connected - waiting" -ForegroundColor DarkYellow
            $lastState = 'offline'
        }
        Start-Sleep -Seconds $IntervalSeconds
        continue
    }

    $existing = @()
    foreach ($line in (& $adb reverse --list 2>$null)) {
        if ($line -match 'tcp:(\d+)') { $existing += [int]$Matches[1] }
    }

    $missing = $Ports | Where-Object { $existing -notcontains $_ }
    if ($missing.Count -gt 0) {
        foreach ($port in $missing) { & $adb reverse "tcp:$port" "tcp:$port" | Out-Null }
        Write-Host "$(Get-Date -Format HH:mm:ss)  restored tunnels: $($missing -join ', ')" -ForegroundColor Green
        $lastState = 'online'
    } elseif ($lastState -ne 'online') {
        Write-Host "$(Get-Date -Format HH:mm:ss)  tunnels healthy" -ForegroundColor Green
        $lastState = 'online'
    }

    Start-Sleep -Seconds $IntervalSeconds
}
