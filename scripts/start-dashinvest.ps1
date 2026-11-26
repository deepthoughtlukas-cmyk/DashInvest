param(
  [switch]$NoBrowser,
  [switch]$AppWindow
)

$ErrorActionPreference = 'Stop'

$ProjectDir = Split-Path -Parent $PSScriptRoot
$AppUrl = 'http://localhost:5173'
$ProxyHealthUrl = 'http://localhost:5173/api/health'
$ApiHealthUrl = 'http://127.0.0.1:3001/api/health'

function Ensure-NodeOnPath {
  if (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue) {
    return $true
  }

  $candidates = @(
    (Join-Path $env:ProgramFiles 'nodejs'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs')
  )
  foreach ($dir in $candidates) {
    if ($dir -and (Test-Path (Join-Path $dir 'npm.cmd'))) {
      $env:PATH = "$dir;$env:PATH"
      return $true
    }
  }
  return $false
}

function Test-PortListening {
  param([int]$Port)
  try {
    $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    foreach ($ep in $listeners) {
      if ($ep.Port -eq $Port) { return $true }
    }
    return $false
  } catch {
    return $true
  }
}

function Test-DashInvestHealth {
  param(
    [string]$Url,
    [int]$Port
  )
  if (-not (Test-PortListening -Port $Port)) { return $false }
  try {
    $res = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    return ($res.StatusCode -eq 200 -and $res.Content -match '"ok"\s*:\s*true')
  } catch {
    return $false
  }
}

function Test-UrlOk {
  param(
    [string]$Url,
    [int]$Port
  )
  if (-not (Test-PortListening -Port $Port)) { return $false }
  try {
    $res = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    return ($res.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Get-ChromePath {
  $candidates = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  )
  foreach ($path in $candidates) {
    if ($path -and (Test-Path $path)) {
      return $path
    }
  }
  return $null
}

function Open-DashInvestBrowser {
  param(
    [string]$Url,
    [switch]$UseAppWindow
  )
  if ($UseAppWindow) {
    $chrome = Get-ChromePath
    if ($chrome) {
      Start-Process -FilePath $chrome -ArgumentList "--app=$Url"
      return
    }
  }
  Start-Process $Url
}

function Start-BrowserWatcher {
  param(
    [string]$Url,
    [string]$HealthUrl,
    [switch]$UseAppWindow
  )
  $chrome = if ($UseAppWindow) { Get-ChromePath } else { $null }
  $chromeLiteral = if ($chrome) { "'" + ($chrome -replace "'", "''") + "'" } else { '$null' }
  $urlLiteral = "'" + ($Url -replace "'", "''") + "'"
  $healthLiteral = "'" + ($HealthUrl -replace "'", "''") + "'"

  $watcherScript = @"
`$ErrorActionPreference = 'SilentlyContinue'
for (`$i = 0; `$i -lt 90; `$i++) {
  try {
    `$r = Invoke-WebRequest -Uri $healthLiteral -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if (`$r.StatusCode -eq 200 -and `$r.Content -match '"ok"\s*:\s*true') {
      `$chrome = $chromeLiteral
      if (`$chrome) {
        Start-Process -FilePath `$chrome -ArgumentList ("--app=" + $urlLiteral)
      } else {
        Start-Process $urlLiteral
      }
      exit 0
    }
  } catch {}
  Start-Sleep -Milliseconds 500
}
"@

  $bytes = [System.Text.Encoding]::Unicode.GetBytes($watcherScript)
  $encoded = [Convert]::ToBase64String($bytes)
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded) | Out-Null
}

if (-not (Ensure-NodeOnPath)) {
  Write-Host 'Node.js / npm.cmd wurde nicht gefunden. Bitte Node.js installieren und erneut versuchen.' -ForegroundColor Red
  if ([Environment]::UserInteractive -and -not $NoBrowser) {
    [void](Read-Host "Dr$([char]0x00FC)cke Enter zum Schlie$([char]0x00DF)en")
  }
  exit 1
}

# Case 1: DashInvest (Frontend + API proxy) is already running -> open directly and exit cleanly.
if ((Test-DashInvestHealth -Url $ProxyHealthUrl -Port 5173)) {
  Write-Host "DashInvest l$([char]0x00E4)uft bereits auf $AppUrl." -ForegroundColor Green
  if (-not $NoBrowser) {
    Open-DashInvestBrowser -Url $AppUrl -UseAppWindow:$AppWindow
  }
  exit 0
}

# Case 2: Start missing backend/frontend components inside this minimized console window.
try {
  $Host.UI.RawUI.WindowTitle = 'DashInvest Server'
} catch {}

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' DashInvest Server wird gestartet...' -ForegroundColor Cyan
Write-Host " Ziel-URL: $AppUrl" -ForegroundColor Gray
Write-Host " Dieses Fenster kann minimiert bleiben; zum Beenden einfach schlie$([char]0x00DF)en." -ForegroundColor Gray
Write-Host '============================================================' -ForegroundColor Cyan

Set-Location $ProjectDir

if (-not (Test-Path (Join-Path $ProjectDir 'node_modules'))) {
  Write-Host "Installiere fehlende Abh$([char]0x00E4)ngigkeiten (npm install)..." -ForegroundColor Yellow
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install fehlgeschlagen (Exit-Code $LASTEXITCODE)." -ForegroundColor Red
    if ([Environment]::UserInteractive -and -not $NoBrowser) {
      [void](Read-Host "Dr$([char]0x00FC)cke Enter zum Schlie$([char]0x00DF)en")
    }
    exit $LASTEXITCODE
  }
}

$apiReady = Test-DashInvestHealth -Url $ApiHealthUrl -Port 3001
$webReady = Test-UrlOk -Url $AppUrl -Port 5173

if (-not $NoBrowser) {
  Start-BrowserWatcher -Url $AppUrl -HealthUrl $ProxyHealthUrl -UseAppWindow:$AppWindow
}

$exitCode = 0
if (-not $apiReady -and -not $webReady) {
  & npm.cmd run dev
  $exitCode = $LASTEXITCODE
} elseif (-not $apiReady) {
  Write-Host "Frontend l$([char]0x00E4)uft bereits; starte Backend-Server (Port 3001)..." -ForegroundColor Yellow
  & npm.cmd run server
  $exitCode = $LASTEXITCODE
} else {
  Write-Host "Backend-Server l$([char]0x00E4)uft bereits; starte Vite-Frontend (Port 5173)..." -ForegroundColor Yellow
  & npx.cmd vite --port 5173
  $exitCode = $LASTEXITCODE
}

if ($exitCode -ne 0) {
  Write-Host "DashInvest wurde mit Fehlercode $exitCode beendet." -ForegroundColor Red
  if ([Environment]::UserInteractive -and -not $NoBrowser) {
    [void](Read-Host "Dr$([char]0x00FC)cke Enter zum Schlie$([char]0x00DF)en")
  }
}
exit $exitCode
