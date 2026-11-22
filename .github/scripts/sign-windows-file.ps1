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

function Get-CertificateEntry([byte[]]$bytes) {
  $pe = [BitConverter]::ToInt32($bytes, 0x3c)
  $optional = $pe + 24
  $magic = [BitConverter]::ToUInt16($bytes, $optional)
  $entry = $optional + $(if ($magic -eq 0x20b) { 112 } else { 96 }) + 4 * 8
  [pscustomobject]@{
    Checksum = $optional + 64
    Entry    = $entry
    Offset   = [BitConverter]::ToUInt32($bytes, $entry)
    Size     = [BitConverter]::ToUInt32($bytes, $entry + 4)
  }
}

function Get-AuthenticodeDigest([byte[]]$bytes) {
  $layout = Get-CertificateEntry $bytes
  $signed = $layout.Size -gt 0 -and ([long]$layout.Offset + $layout.Size) -le $bytes.Length
  $end = if ($signed) { $layout.Offset } else { $bytes.Length }
  $hash = [Security.Cryptography.IncrementalHash]::CreateHash([Security.Cryptography.HashAlgorithmName]::SHA256)
  try {
    $hash.AppendData($bytes, 0, $layout.Checksum)
    $hash.AppendData($bytes, $layout.Checksum + 4, $layout.Entry - $layout.Checksum - 4)
    $hash.AppendData($bytes, $layout.Entry + 8, $end - $layout.Entry - 8)
    if (-not $signed) { $hash.AppendData([byte[]]::new((8 - ($end % 8)) % 8)) }
    -join ($hash.GetHashAndReset() | ForEach-Object { $_.ToString("x2") })
  } finally {
    $hash.Dispose()
  }
}

function Get-PeChecksum([byte[]]$bytes, [int]$checksumOffset) {
  [uint64]$sum = 0
  for ($i = 0; $i -lt $bytes.Length; $i += 2) {
    if ($i -eq $checksumOffset -or $i -eq $checksumOffset + 2) { continue }
    $word = $bytes[$i]
    if ($i + 1 -lt $bytes.Length) { $word = $word -bor ([uint32]$bytes[$i + 1] -shl 8) }
    $sum += $word
    $sum = ($sum -band 0xffff) + ($sum -shr 16)
  }
  $sum = ($sum -band 0xffff) + ($sum -shr 16)
  [uint32]($sum + $bytes.Length)
}

function Join-Signature([byte[]]$unsigned, [byte[]]$blob) {
  $padding = (8 - ($unsigned.Length % 8)) % 8
  $result = [byte[]]::new($unsigned.Length + $padding + $blob.Length)
  [Array]::Copy($unsigned, $result, $unsigned.Length)
  [Array]::Copy($blob, 0, $result, $unsigned.Length + $padding, $blob.Length)
  $layout = Get-CertificateEntry $result
  [BitConverter]::GetBytes([uint32]($unsigned.Length + $padding)).CopyTo($result, $layout.Entry)
  [BitConverter]::GetBytes([uint32]$blob.Length).CopyTo($result, $layout.Entry + 4)
  [BitConverter]::GetBytes((Get-PeChecksum $result $layout.Checksum)).CopyTo($result, $layout.Checksum)
  $result
}

function Get-SignatureBlob([byte[]]$signed) {
  $layout = Get-CertificateEntry $signed
  $blob = [byte[]]::new($layout.Size)
  [Array]::Copy($signed, $layout.Offset, $blob, 0, $layout.Size)
  $blob
}

function Test-OurSignature([string]$file, [string]$thumbprint) {
  try {
    $signature = Get-AuthenticodeSignature -LiteralPath $file
    $signature.Status -eq "Valid" -and
      $signature.SignerCertificate.Thumbprint -eq $thumbprint -and
      $null -ne $signature.TimeStamperCertificate
  } catch {
    $false
  }
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
  $store = $env:WINDOWS_SIGNATURE_STORE
  $thumbprint = $env:SM_CODE_SIGNING_CERT_SHA1_HASH
  $isPe = (Get-SignableExtension $Path) -ne ".msi"
  $reused = $false
  $digest = $null
  if ($store -and $thumbprint -and $isPe) {
    $unsigned = [IO.File]::ReadAllBytes($temp)
    $digest = Get-AuthenticodeDigest $unsigned
    $saved = Join-Path $store "$digest.sig"
    if (Test-Path -LiteralPath $saved) {
      [IO.File]::WriteAllBytes($temp, (Join-Signature $unsigned ([IO.File]::ReadAllBytes($saved))))
      if (Test-OurSignature $temp $thumbprint) {
        Write-Host "Reusing the saved signature for $Path"
        $reused = $true
      } else {
        Write-Host "Saved signature for $Path does not verify, signing afresh"
        [IO.File]::WriteAllBytes($temp, $unsigned)
      }
    }
  }
  if (-not $reused) {
    Write-Host "Signing $Path"
    & smctl sign --keypair-alias $alias --input $temp --verbose
    if ($LASTEXITCODE -ne 0) { throw "smctl sign exited $LASTEXITCODE for $Path" }
    if (-not (Test-Signed $temp)) { throw "smctl reported success but $Path is not signed" }
    if ($digest -and (Test-OurSignature $temp $thumbprint)) {
      $blob = Get-SignatureBlob ([IO.File]::ReadAllBytes($temp))
      New-Item -ItemType Directory -Force -Path $store | Out-Null
      [IO.File]::WriteAllBytes((Join-Path $store "$digest.sig"), $blob)
      if ($env:WINDOWS_SIGNATURE_STORE_NEW) {
        New-Item -ItemType Directory -Force -Path $env:WINDOWS_SIGNATURE_STORE_NEW | Out-Null
        [IO.File]::WriteAllBytes((Join-Path $env:WINDOWS_SIGNATURE_STORE_NEW "$digest.sig"), $blob)
      }
    }
  }
  Copy-Item -LiteralPath $temp -Destination $Path -Force
  if ((Get-FileHash -LiteralPath $temp).Hash -ne (Get-FileHash -LiteralPath $Path).Hash) {
    throw "Signed copy did not land back on $Path"
  }
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
