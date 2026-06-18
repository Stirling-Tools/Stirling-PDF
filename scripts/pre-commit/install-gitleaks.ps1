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

if (-not $Sha) {
    throw 'No pinned gitleaks checksum for this platform'
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Dest) | Out-Null

# A .zip name (not New-TemporaryFile's .tmp) so Expand-Archive accepts it, and
# Join-Path avoids New-TemporaryFile, which is missing in some PowerShell builds.
$archive = Join-Path $env:TEMP 'gitleaks.zip'
$extract = Join-Path $env:TEMP 'gitleaks-extract'
try {
    Invoke-WebRequest -Uri $Url -OutFile $archive
    if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $Sha) {
        throw 'gitleaks checksum mismatch'
    }
    Expand-Archive -Force -Path $archive -DestinationPath $extract
    Move-Item -Force -Path (Join-Path $extract 'gitleaks.exe') -Destination $Dest
} finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $archive, $extract -Recurse
}
