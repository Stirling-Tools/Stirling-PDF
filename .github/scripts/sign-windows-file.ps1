param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Path
)

$ErrorActionPreference = "Stop"

$unshippedPatterns = @(
  '[\\/]wix[\\/][^\\/]+[\\/]wix[\\/]Wix[^\\/]*Extension\.dll$',
  '[\\/]nsis[\\/][^\\/]+[\\/]Plugins[\\/]x86-unicode[\\/][^\\/]+\.dll$'
)
foreach ($pattern in $unshippedPatterns) {
  if ($Path -match $pattern) {
    Write-Host "Skipping $Path, the installer does not ship this copy"
    exit 0
  }
}

function Test-Signed([string]$file) {
  try { (Get-AuthenticodeSignature -LiteralPath $file).Status -eq "Valid" } catch { $false }
}

function Clear-DanglingCertificateTable([string]$file) {
  $bytes = [IO.File]::ReadAllBytes($file)
  if ($bytes.Length -lt 0x40 -or $bytes[0] -ne 0x4d -or $bytes[1] -ne 0x5a) { return }
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
  [IO.File]::WriteAllBytes($file, $bytes)
}

function Get-SignableExtension([string]$file) {
  $extension = [IO.Path]::GetExtension($file).ToLowerInvariant()
  if ($extension -in @(".exe", ".dll", ".msi", ".sys", ".ocx")) { return $extension }
  $header = [byte[]]::new(2)
  $stream = [IO.File]::OpenRead($file)
  try { [void]$stream.Read($header, 0, 2) } finally { $stream.Dispose() }
  if ($header[0] -eq 0x4d -and $header[1] -eq 0x5a) { return ".exe" }
  throw "Cannot tell what kind of file $file is, refusing to sign it"
}

if (Test-Signed $Path) {
  Write-Host "Already signed: $Path"
  exit 0
}

$alias = $env:SM_KEYPAIR_ALIAS
if (-not $alias) { throw "SM_KEYPAIR_ALIAS is not set" }

$work = Join-Path ([IO.Path]::GetTempPath()) ("stirling-sign-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $temp = Join-Path $work ("file" + (Get-SignableExtension $Path))
  Copy-Item -LiteralPath $Path -Destination $temp -Force
  Clear-DanglingCertificateTable $temp
  Write-Host "Signing $Path"
  & smctl sign --keypair-alias $alias --input $temp --verbose
  if ($LASTEXITCODE -ne 0) { throw "smctl sign exited $LASTEXITCODE for $Path" }
  if (-not (Test-Signed $temp)) { throw "smctl reported success but $Path is not signed" }
  Copy-Item -LiteralPath $temp -Destination $Path -Force
  if ((Get-FileHash -LiteralPath $temp).Hash -ne (Get-FileHash -LiteralPath $Path).Hash) {
    throw "Signed copy did not land back on $Path"
  }
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
