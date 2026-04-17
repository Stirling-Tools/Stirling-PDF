# Stirling PDF Server — Chocolatey install script
# Installs the Spring Boot JAR and registers a Windows service via NSSM.
# The $version and $checksum variables are updated automatically by the
# chocolatey-publish.yml CI workflow on each release.

$ErrorActionPreference = 'Stop'

$packageName = 'stirling-pdf-server'
$version     = '2.8.0'

# ── Download URLs ─────────────────────────────────────────────────────────────

$jarUrl      = "https://github.com/Stirling-Tools/Stirling-PDF/releases/download/v${version}/Stirling-PDF-server.jar"
$jarChecksum = 'PLACEHOLDER_SHA256_UPDATED_BY_CI'

# TODO: bump Adoptium URL + sha256 to latest 25.0.X point release before release.
$jreUrl      = "https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.1%2B9/OpenJDK25U-jre_x64_windows_hotspot_25.0.1_9.zip"
$jreChecksum = 'PLACEHOLDER_JRE_SHA256'

# ── Install paths ─────────────────────────────────────────────────────────────

$installDir  = Join-Path $env:ProgramData 'StirlingPDF'
$jreDir      = Join-Path $installDir 'jre'
$jarDest     = Join-Path $installDir "Stirling-PDF-${version}.jar"
$logDir      = Join-Path $installDir 'logs'
$dataDir     = Join-Path $installDir 'data'

$serviceName = 'StirlingPDFServer'

# ── Create directories ────────────────────────────────────────────────────────

foreach ($dir in @($installDir, $logDir, $dataDir)) {
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
}

# ── Download JAR ──────────────────────────────────────────────────────────────

Write-Host "Downloading Stirling PDF JAR v${version}..."
Get-ChocolateyWebFile -PackageName $packageName `
                      -FileFullPath $jarDest `
                      -Url $jarUrl `
                      -Checksum $jarChecksum `
                      -ChecksumType 'sha256'

# ── Download and unpack JRE ───────────────────────────────────────────────────

$jreZip = Join-Path $env:TEMP 'temurin25-jre.zip'
Write-Host "Downloading Temurin JRE 25..."
Get-ChocolateyWebFile -PackageName $packageName `
                      -FileFullPath $jreZip `
                      -Url $jreUrl `
                      -Checksum $jreChecksum `
                      -ChecksumType 'sha256'

if (Test-Path $jreDir) {
  Remove-Item $jreDir -Recurse -Force
}
Get-ChocolateyUnzip -FileFullPath $jreZip -Destination $installDir
# Temurin zip extracts to a versioned sub-directory; rename it to 'jre'
$extracted = Get-ChildItem $installDir -Directory | Where-Object { $_.Name -like 'jdk-*' } | Select-Object -First 1
if ($extracted) {
  Rename-Item $extracted.FullName $jreDir
}
Remove-Item $jreZip -Force -ErrorAction SilentlyContinue

$javaExe = Join-Path $jreDir 'bin\java.exe'
if (-not (Test-Path $javaExe)) {
  throw "JRE installation failed: java.exe not found at $javaExe"
}

# ── Register Windows service via NSSM ────────────────────────────────────────

$nssmCmd = Get-Command nssm -ErrorAction SilentlyContinue
$nssmExe = if ($nssmCmd) { $nssmCmd.Source } else { $null }
if (-not $nssmExe) {
  throw "NSSM not found. Ensure the 'nssm' Chocolatey dependency is installed."
}

# Remove existing service if upgrading
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService) {
  Write-Host "Stopping and removing existing service..."
  & $nssmExe stop $serviceName confirm 2>$null
  & $nssmExe remove $serviceName confirm
}

Write-Host "Registering Windows service '$serviceName'..."
& $nssmExe install $serviceName $javaExe
& $nssmExe set $serviceName AppParameters `
    "-server -XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -Dserver.port=8080 -DHOME_DIRECTORY=`"$dataDir`" -Dlogging.file.path=`"$logDir`" -jar `"$jarDest`""
& $nssmExe set $serviceName AppDirectory $installDir
& $nssmExe set $serviceName DisplayName "Stirling PDF Server"
& $nssmExe set $serviceName Description "Stirling PDF headless web server (port 8080)"
& $nssmExe set $serviceName Start SERVICE_AUTO_START
& $nssmExe set $serviceName AppStdout (Join-Path $logDir 'service-stdout.log')
& $nssmExe set $serviceName AppStderr (Join-Path $logDir 'service-stderr.log')
& $nssmExe set $serviceName AppRotateFiles 1
& $nssmExe set $serviceName AppRotateSeconds 86400

# Start the service
& $nssmExe start $serviceName

Write-Host ""
Write-Host "Stirling PDF Server installed and started."
Write-Host "Web UI available at: http://localhost:8080"
Write-Host "Logs: $logDir"
Write-Host ""
