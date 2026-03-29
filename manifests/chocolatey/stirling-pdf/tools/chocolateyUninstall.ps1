# Stirling PDF — Chocolatey uninstall script (desktop MSI)

$ErrorActionPreference = 'Stop'

$packageName    = 'stirling-pdf'
$softwareName   = 'Stirling-PDF*'
$installerType  = 'msi'
$silentArgs     = '/quiet /norestart'
$validExitCodes = @(0, 3010, 1605, 1614, 1641)

[array]$key = Get-UninstallRegistryKey -SoftwareName $softwareName

if ($key.Count -eq 1) {
  $key | ForEach-Object {
    $packageArgs = @{
      packageName    = $packageName
      fileType       = $installerType
      silentArgs     = "/x $($_.PSChildName) $silentArgs"
      validExitCodes = $validExitCodes
    }
    Uninstall-ChocolateyPackage @packageArgs
  }
} elseif ($key.Count -eq 0) {
  Write-Warning "$packageName has already been uninstalled by other means."
} elseif ($key.Count -gt 1) {
  Write-Warning "$($key.Count) matches found for '$softwareName'."
  Write-Warning "To prevent accidental removal of the wrong program, no uninstallation will occur."
  Write-Warning "Please uninstall manually via 'Add or Remove Programs'."
}
