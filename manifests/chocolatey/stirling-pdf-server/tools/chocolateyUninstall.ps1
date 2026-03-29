# Stirling PDF Server — Chocolatey uninstall script

$ErrorActionPreference = 'Stop'

$serviceName = 'StirlingPDFServer'
$installDir  = Join-Path $env:ProgramData 'StirlingPDF'

# ── Stop and remove the Windows service ──────────────────────────────────────

$nssmCmd = Get-Command nssm -ErrorAction SilentlyContinue
$nssmExe = if ($nssmCmd) { $nssmCmd.Source } else { $null }

$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService) {
  Write-Host "Stopping service '$serviceName'..."
  if ($nssmExe) {
    & $nssmExe stop $serviceName confirm 2>$null
    & $nssmExe remove $serviceName confirm
  } else {
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    & sc.exe delete $serviceName
  }
  Write-Host "Service removed."
} else {
  Write-Warning "Service '$serviceName' not found; skipping service removal."
}

# ── Remove installation directory ────────────────────────────────────────────

if (Test-Path $installDir) {
  Write-Host "Removing installation directory: $installDir"
  Remove-Item $installDir -Recurse -Force
} else {
  Write-Warning "Installation directory '$installDir' not found; skipping."
}

Write-Host "Stirling PDF Server has been uninstalled."
