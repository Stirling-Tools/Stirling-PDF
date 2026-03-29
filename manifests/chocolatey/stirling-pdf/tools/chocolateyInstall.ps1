# Stirling PDF — Chocolatey install script (desktop MSI)
# The $version and $checksum variables are updated automatically by the
# chocolatey-publish.yml CI workflow on each release.

$ErrorActionPreference = 'Stop'

$packageName = 'stirling-pdf'
$version     = '2.8.0'
$installerType = 'msi'

$url64 = "https://github.com/Stirling-Tools/Stirling-PDF/releases/download/v${version}/Stirling-PDF-windows-x86_64.msi"
$checksum64 = 'PLACEHOLDER_SHA256_UPDATED_BY_CI'
$checksumType64 = 'sha256'

$silentArgs = '/quiet /norestart ALLUSERS=1'

$packageArgs = @{
  packageName    = $packageName
  fileType       = $installerType
  url64bit       = $url64
  softwareName   = 'Stirling-PDF*'
  checksum64     = $checksum64
  checksumType64 = $checksumType64
  silentArgs     = $silentArgs
  validExitCodes = @(0, 3010, 1641)
}

Install-ChocolateyPackage @packageArgs

Write-Host ""
Write-Host "Stirling PDF has been installed."
Write-Host "Launch it from the Start Menu or desktop shortcut."
Write-Host ""
