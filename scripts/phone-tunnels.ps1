#!/usr/bin/env pwsh
<#
.SYNOPSIS
Keep the phone's USB tunnels to the local services alive.

.DESCRIPTION
A presentation and a claim both need the wallet to reach a service at 127.0.0.1, and a phone can
only do that over an `adb reverse` tunnel. Those tunnels belong to the USB connection, not to the
phone and not to the services, so they vanish whenever that connection re-negotiates: the cable is
nudged, the phone sleeps deeply, or a USB port is suspended by Windows. The device usually comes
straight back as `device`, which is why the symptom is a wallet that cannot connect while `adb
devices` looks perfectly healthy.

This script sets the tunnels up, checks that the phone can actually reach the issuer, and with
-Watch keeps doing so. Re-setting a tunnel that already exists is harmless, so it can be run as
often as you like.

.EXAMPLE
./scripts/phone-tunnels.ps1
Sets the tunnels once and reports whether the phone can reach the issuer.

.EXAMPLE
./scripts/phone-tunnels.ps1 -Watch
Stays running and restores the tunnels within a few seconds of them dropping.

.EXAMPLE
./scripts/phone-tunnels.ps1 -Ports 3000
Only the port a claim needs, for a quick check.
#>
param(
  [int[]]$Ports = @(3000, 3001, 3002, 3003, 3004, 3007),
  [switch]$Watch,
  [int]$IntervalSeconds = 5
)

$ErrorActionPreference = 'Stop'

function Get-Adb {
  # Each of these may be unset, so build the list from the ones that are not.
  $candidates = @()
  if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe') }
  if ($env:ANDROID_HOME) { $candidates += (Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe') }
  if ($env:ANDROID_SDK_ROOT) { $candidates += (Join-Path $env:ANDROID_SDK_ROOT 'platform-tools\adb.exe') }
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  $onPath = Get-Command adb -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  throw 'adb was not found. Install Android platform-tools, or set ANDROID_HOME.'
}

function Get-DeviceState($adb) {
  $lines = & $adb devices 2>&1 | Select-Object -Skip 1 | Where-Object { $_ -match '\S' }
  if (-not $lines) { return 'absent' }
  $first = ($lines | Select-Object -First 1) -split '\s+'
  return $first[1]
}

function Set-Tunnels($adb, $ports) {
  $before = @(& $adb reverse --list 2>&1 | Where-Object { $_ -match 'tcp:' })
  foreach ($port in $ports) { & $adb reverse "tcp:$port" "tcp:$port" | Out-Null }
  $after = @(& $adb reverse --list 2>&1 | Where-Object { $_ -match 'tcp:' })
  return [pscustomobject]@{
    Before = $before.Count
    After  = $after.Count
    Missing = @($ports | Where-Object { $p = $_; -not ($after | Where-Object { $_ -match "tcp:$p\b" }) })
  }
}

function Test-FromPhone($adb, $port) {
  $code = & $adb shell "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$port/" 2>&1
  return ($code | Out-String).Trim()
}

$adb = Get-Adb
Write-Host "adb:      $adb"
Write-Host "ports:    $($Ports -join ', ')"
Write-Host ''

$reported = $false
while ($true) {
  $state = Get-DeviceState $adb
  if ($state -ne 'device') {
    Write-Host "[$(Get-Date -Format HH:mm:ss)] phone is '$state'." -ForegroundColor Yellow
    if ($state -eq 'unauthorized') {
      Write-Host '  Tap Allow on the phone for USB debugging, then this will pick it up.' -ForegroundColor Yellow
    }
    $reported = $false
  } else {
    $result = Set-Tunnels $adb $Ports
    $code = Test-FromPhone $adb ($Ports[0])
    if ($result.Missing.Count -gt 0) {
      Write-Host "[$(Get-Date -Format HH:mm:ss)] $($result.Missing.Count) tunnel(s) did not take: $($result.Missing -join ', ')" -ForegroundColor Red
    }
    if ($result.Before -eq 0) {
      Write-Host "[$(Get-Date -Format HH:mm:ss)] tunnels were missing and have been restored." -ForegroundColor Yellow
    } elseif (-not $reported) {
      Write-Host "[$(Get-Date -Format HH:mm:ss)] tunnels were already in place." -ForegroundColor Green
    }
    Write-Host "  issuer from the phone: HTTP $code  (404 is an answer, which is all that matters)"
    $reported = $true
  }

  if (-not $Watch) { break }
  # The watch interval: a tunnel that drops is usually back before the holder retries.
  Start-Sleep -Seconds $IntervalSeconds
}
