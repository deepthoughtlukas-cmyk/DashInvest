param(
  [switch]$AppWindow
)

$ErrorActionPreference = 'Stop'

$ProjectDir = Split-Path -Parent $PSScriptRoot
$StartScript = Join-Path $PSScriptRoot 'start-dashinvest.ps1'
$IconPath = Join-Path $PSScriptRoot 'dashinvest.ico'
$DesktopDir = [Environment]::GetFolderPath('Desktop')

if (-not (Test-Path $StartScript)) {
  throw "Launcher-Skript nicht gefunden: $StartScript"
}
if (-not (Test-Path $IconPath)) {
  throw "Icon-Datei nicht gefunden: $IconPath"
}
if ([string]::IsNullOrWhiteSpace($DesktopDir) -or -not (Test-Path $DesktopDir)) {
  throw "Desktop-Verzeichnis konnte nicht ermittelt werden: '$DesktopDir'"
}

$ShortcutPath = Join-Path $DesktopDir 'DashInvest.lnk'
$Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""
if ($AppWindow) {
  $Arguments += ' -AppWindow'
}

$PowerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = $PowerShellExe
$shortcut.Arguments = $Arguments
$shortcut.WorkingDirectory = $ProjectDir
$shortcut.WindowStyle = 7
$shortcut.IconLocation = "$IconPath,0"
$shortcut.Description = 'DashInvest - Markt-, Chart- & Makro-Analyse Dashboard'
$shortcut.Save()

if (-not (Test-Path $ShortcutPath)) {
  throw "Desktop-Verkn$([char]0x00FC)pfung wurde nicht erstellt: $ShortcutPath"
}

Write-Host "Desktop-Verkn$([char]0x00FC)pfung erstellt: $ShortcutPath" -ForegroundColor Green
