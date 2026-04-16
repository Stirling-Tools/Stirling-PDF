# Windows code signing wrapper for Tauri's signCommand.
# Called by Tauri during build to sign each binary BEFORE it gets
# packaged into MSI/NSIS installers.
#
# Uses DigiCert KeyLocker (smctl) when available in CI,
# silently skips signing for local development builds.

param(
    [Parameter(Position = 0, Mandatory = $true)]
    [string]$FilePath
)

# Skip signing if smctl is not available (local dev)
$smctl = Get-Command smctl -ErrorAction SilentlyContinue
if (-not $smctl) {
    Write-Host "smctl not found - skipping signing (local dev build)"
    exit 0
}

# Skip signing if PKCS11_CONFIG is not set (signing not configured)
$pkcs11Config = $env:PKCS11_CONFIG
if (-not $pkcs11Config) {
    Write-Host "PKCS11_CONFIG not set - skipping signing"
    exit 0
}

Write-Host "Signing: $FilePath"

# Use certificate fingerprint if available, otherwise keypair alias
$fingerprint = $env:SM_CODE_SIGNING_CERT_SHA1_HASH
if ($fingerprint) {
    $output = & smctl sign --fingerprint "$fingerprint" --input "$FilePath" --config-file "$pkcs11Config" 2>&1
} else {
    $keypairAlias = $env:SM_KEYPAIR_ALIAS
    if (-not $keypairAlias) {
        Write-Host "Neither SM_CODE_SIGNING_CERT_SHA1_HASH nor SM_KEYPAIR_ALIAS set - skipping signing"
        exit 0
    }
    $output = & smctl sign --keypair-alias "$keypairAlias" --input "$FilePath" --config-file "$pkcs11Config" 2>&1
}

$exitCode = $LASTEXITCODE
Write-Host $output

if ($exitCode -ne 0) {
    Write-Host "[ERROR] Failed to sign: $FilePath"
    exit 1
}

Write-Host "[SUCCESS] Signed: $FilePath"
