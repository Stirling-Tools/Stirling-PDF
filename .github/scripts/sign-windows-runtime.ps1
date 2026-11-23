<#
.SYNOPSIS
Signs bundled runtime binaries or verifies existing signatures.
.DESCRIPTION
Signing rewrites .dll/.exe files under Root in place, skipping valid signatures.
It requires smctl on PATH, SM_KEYPAIR_ALIAS and a writable RUNNER_TEMP.
Failures terminate with a nonzero exit; previously signed files remain changed.
.PARAMETER Root
Directory searched recursively; missing or empty binary sets fail.
.PARAMETER VerifyOnly
Read-only Authenticode validation. Requires no signing credentials and fails
if any discovered binary lacks a valid signature.
#>
param(
  [Parameter(Mandatory = $true)][string]$Root,
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"

$binaries = @(Get-ChildItem -LiteralPath $Root -Recurse -File |
  Where-Object { $_.Extension -in @(".dll", ".exe") })
if ($binaries.Count -eq 0) { throw "No .dll or .exe files found under $Root" }

function Test-Signed([string]$path) {
  (Get-AuthenticodeSignature -LiteralPath $path).Status -eq "Valid"
}

function Clear-DanglingCertificateTable([string]$path) {
  $bytes = [IO.File]::ReadAllBytes($path)
  $pe = [BitConverter]::ToInt32($bytes, 0x3c)
  $optional = $pe + 24
  $magic = [BitConverter]::ToUInt16($bytes, $optional)
  $directories = $optional + $(if ($magic -eq 0x20b) { 112 } else { 96 })
  $entry = $directories + 4 * 8
  $offset = [BitConverter]::ToUInt32($bytes, $entry)
  $size = [BitConverter]::ToUInt32($bytes, $entry + 4)
  if ($size -eq 0 -or ([long]$offset + $size) -le $bytes.Length) { return }
  Write-Host "Clearing certificate table that points past the end of the file ($offset+$size > $($bytes.Length))"
  [Array]::Clear($bytes, $entry, 8)
  [IO.File]::WriteAllBytes($path, $bytes)
}

if ($VerifyOnly) {
  $unsigned = @($binaries | Where-Object { -not (Test-Signed $_.FullName) })
  foreach ($file in $unsigned) { Write-Host "[ERROR] Not signed: $($file.FullName)" }
  if ($unsigned.Count -gt 0) { exit 1 }
  Write-Host "[SUCCESS] All $($binaries.Count) runtime binaries under $Root are signed"
  exit 0
}

$alias = $env:SM_KEYPAIR_ALIAS
if (-not $alias) { throw "SM_KEYPAIR_ALIAS is not set" }

$work = Join-Path $env:RUNNER_TEMP "runtime-presign"
New-Item -ItemType Directory -Force -Path $work | Out-Null

$signed = 0
$index = 0
foreach ($file in $binaries) {
  if (Test-Signed $file.FullName) { continue }
  $index++
  $temp = Join-Path $work ("binary{0}{1}" -f $index, $file.Extension)
  Copy-Item -LiteralPath $file.FullName -Destination $temp -Force
  Clear-DanglingCertificateTable $temp
  Write-Host "Signing $($file.FullName)"
  & smctl sign --keypair-alias $alias --input $temp --verbose
  if ($LASTEXITCODE -ne 0) { throw "smctl sign exited $LASTEXITCODE for $($file.FullName)" }
  if (-not (Test-Signed $temp)) { throw "smctl reported success but $($file.FullName) is not signed" }
  Copy-Item -LiteralPath $temp -Destination $file.FullName -Force
  Remove-Item -LiteralPath $temp -Force
  if (-not (Test-Signed $file.FullName)) { throw "Signature lost copying back $($file.FullName)" }
  $signed++
}

Write-Host "[SUCCESS] Signed $signed of $($binaries.Count) runtime binaries under $Root"
