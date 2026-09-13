#!/usr/bin/env pwsh
#
# Start the demo: the issuer service, the verifier service and the four web applications.
#
# Replaces an earlier version of this script that printed a fabricated "150/150 tests, 100% SUCCESS"
# summary without running anything, and listed ports (5173/5174) and a directory
# (mobile-wallet-native) that no longer exist. Tests belong to `npm test`; this script only starts
# services, and it reports what actually happened.
#
#   ./START_LOCAL_SERVICES.ps1            start everything
#   ./START_LOCAL_SERVICES.ps1 -Stop      stop everything

param(
  [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
Set-Location $repo

$services = @(
  @{ Port = 3000; Dir = 'issuer-service';            Args = @('start') },
  @{ Port = 3001; Dir = 'verifier-service';          Args = @('start') },
  @{ Port = 3002; Dir = 'issuer-frontend';           Args = @('dev') },
  @{ Port = 3003; Dir = 'verifier-frontend';         Args = @('dev') },
  @{ Port = 3004; Dir = 'quals-portal';              Args = @('dev') },
  @{ Port = 3007; Dir = 'trust-university-frontend'; Args = @('dev') }
)

function Get-PortOwner([int]$port) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($conn) { return $conn.OwningProcess | Select-Object -First 1 }
  return $null
}

if ($Stop) {
  foreach ($service in $services) {
    $owner = Get-PortOwner $service.Port
    if ($owner) {
      Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
      Write-Host "stopped  $($service.Port)  $($service.Dir)"
    }
  }
  return
}

if (-not (Test-Path (Join-Path $repo 'node_modules'))) {
  Write-Host 'node_modules is missing. Run: npm ci' -ForegroundColor Yellow
  exit 1
}

# The demo needs no email provider, and gets the one-time code in the API response instead.
#
# This has to override, not defer to, `issuer-service/.env`: a developer machine usually has a real
# BREVO_API_KEY there, so code that was emailed is code the local flow can never see. Setting a
# placeholder makes the send fail, which is what makes the issuer return the code. Verified both
# ways — see docs/stories/P1-08-local-env-changes-demo-behaviour.md.
if (-not $env:BREVO_API_KEY) { $env:BREVO_API_KEY = 'dev-disabled' }
if (-not $env:ALLOW_DEV_OTP) { $env:ALLOW_DEV_OTP = 'true' }

$logDir = Join-Path $repo 'data'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

foreach ($service in $services) {
  $existing = Get-PortOwner $service.Port
  if ($existing) {
    Write-Host "already running  $($service.Port)  $($service.Dir)  (pid $existing)" -ForegroundColor DarkGray
    continue
  }

  $dir = Join-Path $repo $service.Dir
  $arguments = @('run') + $service.Args
  Start-Process -FilePath 'npm.cmd' -ArgumentList $arguments -WorkingDirectory $dir -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "$($service.Dir)-$($service.Port).log") `
    -RedirectStandardError (Join-Path $logDir "$($service.Dir)-$($service.Port).err.log") | Out-Null
  Write-Host "started  $($service.Port)  $($service.Dir)"
}

Write-Host "`nWaiting for the services to accept connections..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(120)
foreach ($service in $services) {
  $ready = $false
  while ((Get-Date) -lt $deadline -and -not $ready) {
    $ready = [bool](Get-PortOwner $service.Port)
    if (-not $ready) { Start-Sleep -Milliseconds 500 }
  }
  $state = if ($ready) { 'up' } else { 'NOT LISTENING' }
  Write-Host ("  {0,-6} {1,-28} {2}" -f $service.Port, $service.Dir, $state)
}

Write-Host @"

Demo URLs
  Academy (student)      http://localhost:3002
  My Jobs (verifier)     http://localhost:3003
  Quals portal (admin)   http://localhost:3004
  Trust University       http://localhost:3007
  Issuer API             http://localhost:3000
  Verifier API           http://localhost:3001

First run
  npm ci                  install every workspace from the committed lockfile
  npm run db:reset        start from an empty database (removes leftover demo state)
  npm run db:seed         create the demo organisations and an administrator to sign in with

Logs go to data/<workspace>-<port>.log and .err.log.
Stop everything with: ./START_LOCAL_SERVICES.ps1 -Stop

Android wallet on a phone: forward the ports over USB. A presentation needs a secure context, and
'localhost' qualifies while a LAN address does not.
  adb reverse tcp:3000 tcp:3000
  adb reverse tcp:3001 tcp:3001
  adb reverse tcp:3002 tcp:3002
"@ -ForegroundColor Gray
