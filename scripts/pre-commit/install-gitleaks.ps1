# Download, checksum-verify and extract the gitleaks binary.
#
# Usage: install-gitleaks.ps1 -Url <url> -Sha <sha256> -Dest <dest>
#
# Called by the pre-commit:gitleaks-bin Task target, which owns the pinned
# version and per-platform checksums and passes the resolved values in.
param(
    [Parameter(Mandatory)] [string]$Url,
    [Parameter(Mandatory)] [string]$Sha,
    [Parameter(Mandatory)] [string]$Dest
)
$ErrorActionPreference = 'Stop'

function Get-Sha256 {
    param([Parameter(Mandatory)] [string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            $hash = $sha256.ComputeHash($stream)
            return [System.BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant()
        } finally {
            $sha256.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

if (-not $Sha) {
    throw 'No pinned gitleaks checksum for this platform'
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Dest) | Out-Null

$archive = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName() + '.zip')
$extract = Join-Path $env:TEMP 'gitleaks-extract'
try {
    Invoke-WebRequest -Uri $Url -OutFile $archive
    if ((Get-Sha256 $archive) -ne $Sha.ToLowerInvariant()) {
        throw 'gitleaks checksum mismatch'
    }
    Expand-Archive -Force -Path $archive -DestinationPath $extract
    Move-Item -Force -Path (Join-Path $extract 'gitleaks.exe') -Destination $Dest
} finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $archive, $extract -Recurse
}
