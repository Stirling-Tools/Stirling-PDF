param(
  [Parameter(Mandatory = $true)][string]$Root,
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"

$binaries = @(Get-ChildItem -LiteralPath $Root -Recurse -File |
  Where-Object { $_.Extension -in @(".dll", ".exe") })
if ($binaries.Count -eq 0) { throw "No .dll or .exe files found under $Root" }

function Test-Signed([string]$path) {
  try { (Get-AuthenticodeSignature -LiteralPath $path).Status -eq "Valid" } catch { $false }
}

if ($VerifyOnly) {
  $unsigned = @($binaries | Where-Object { -not (Test-Signed $_.FullName) })
  foreach ($file in $unsigned) { Write-Host "[ERROR] Not signed: $($file.FullName)" }
  if ($unsigned.Count -gt 0) { exit 1 }
  Write-Host "[SUCCESS] All $($binaries.Count) binaries under $Root are signed"
  exit 0
}

$signFile = Join-Path $PSScriptRoot "sign-windows-file.ps1"
$signed = 0
foreach ($file in $binaries) {
  if (Test-Signed $file.FullName) { continue }
  & $signFile $file.FullName
  $signed++
}

Write-Host "[SUCCESS] Signed $signed of $($binaries.Count) binaries under $Root"
