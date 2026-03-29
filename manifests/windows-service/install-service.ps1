#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Install Stirling-PDF as a Windows service using WinSW.

.DESCRIPTION
    Downloads WinSW (if not present), copies the JAR and config into a service
    directory, installs and starts the Stirling-PDF Windows service.

.PARAMETER JarPath
    Path to the Stirling-PDF JAR file. If omitted the script searches the
    current directory and one level up.

.PARAMETER InstallDir
    Directory where service files are placed.
    Default: C:\Program Files\Stirling-PDF

.PARAMETER WinSwExe
    Path to an existing WinSW executable. If not provided the script attempts
    to download the latest release from GitHub.

.EXAMPLE
    .\install-service.ps1 -JarPath .\Stirling-PDF-1.0.0.jar
#>

[CmdletBinding()]
param(
    [string]$JarPath,
    [string]$InstallDir = 'C:\Program Files\Stirling-PDF',
    [string]$WinSwExe
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Step([string]$msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Err([string]$msg)  { Write-Host "[!] $msg" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------------
# Locate JAR
# ---------------------------------------------------------------------------
if (-not $JarPath) {
    $JarPath = Get-ChildItem -Path '.', '..' -Filter 'Stirling-PDF*.jar' -ErrorAction SilentlyContinue |
               Select-Object -First 1 -ExpandProperty FullName
}
if (-not $JarPath -or -not (Test-Path $JarPath)) {
    Write-Err "Could not find Stirling-PDF JAR. Pass -JarPath <path>."
}
$JarPath = Resolve-Path $JarPath
Write-Ok "Using JAR: $JarPath"

# ---------------------------------------------------------------------------
# Check Java
# ---------------------------------------------------------------------------
Write-Step "Checking Java..."
try {
    $javaVersion = (& java -version 2>&1 | Select-String '(\d+)' | ForEach-Object { $_.Matches[0].Value } | Select-Object -First 1)
    if ([int]$javaVersion -lt 17) { Write-Err "Java 17+ required (found $javaVersion). Install from https://adoptium.net" }
    Write-Ok "Java $javaVersion found."
} catch {
    Write-Err "Java not found. Install Java 17+ from https://adoptium.net and ensure it is on PATH."
}

# ---------------------------------------------------------------------------
# Prepare install directory
# ---------------------------------------------------------------------------
Write-Step "Creating install directory: $InstallDir"
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path "$InstallDir\data"  -Force | Out-Null
New-Item -ItemType Directory -Path "$InstallDir\logs"  -Force | Out-Null

# ---------------------------------------------------------------------------
# Download WinSW if needed
# ---------------------------------------------------------------------------
$winsw = "$InstallDir\stirling-pdf-service.exe"
if ($WinSwExe -and (Test-Path $WinSwExe)) {
    Copy-Item -Path $WinSwExe -Destination $winsw -Force
} elseif (-not (Test-Path $winsw)) {
    Write-Step "Downloading WinSW..."
    $winswUrl = 'https://github.com/winsw/winsw/releases/latest/download/WinSW-x64.exe'
    Invoke-WebRequest -Uri $winswUrl -OutFile $winsw -UseBasicParsing
    Write-Ok "WinSW downloaded."
}

# ---------------------------------------------------------------------------
# Copy files
# ---------------------------------------------------------------------------
Write-Step "Copying JAR..."
Copy-Item -Path $JarPath -Destination "$InstallDir\stirling-pdf.jar" -Force

Write-Step "Copying service config..."
$xmlSrc = Join-Path $PSScriptRoot 'stirling-pdf-service.xml'
if (-not (Test-Path $xmlSrc)) { Write-Err "Service XML not found: $xmlSrc" }
Copy-Item -Path $xmlSrc -Destination "$InstallDir\stirling-pdf-service.xml" -Force

# WinSW requires the XML to be named <exe-name>.xml
$winsw64Xml = "$InstallDir\stirling-pdf-service.xml"

# ---------------------------------------------------------------------------
# Install service
# ---------------------------------------------------------------------------
Write-Step "Installing service..."
& $winsw install 2>&1 | Write-Host

Write-Step "Starting service..."
& $winsw start 2>&1 | Write-Host

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Ok ""
Write-Ok "Stirling-PDF service installed and started."
Write-Ok "  Service name : StirlingPDF"
Write-Ok "  Install dir  : $InstallDir"
Write-Ok "  Logs         : $InstallDir\logs\"
Write-Ok "  URL          : http://localhost:8080"
Write-Ok ""
Write-Ok "Manage with:"
Write-Ok "  sc start StirlingPDF   / sc stop StirlingPDF"
Write-Ok "  Or open Services (services.msc) and look for 'Stirling-PDF'."
