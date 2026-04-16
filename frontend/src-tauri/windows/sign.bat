@echo off
REM Windows code signing wrapper for Tauri's signCommand.
REM Called by Tauri during build to sign each binary BEFORE it gets
REM packaged into MSI/NSIS installers.
REM
REM Uses DigiCert KeyLocker (smctl) when available in CI,
REM silently skips signing for local development builds.

set "FILE_TO_SIGN=%~1"

REM Skip signing if smctl is not available (local dev)
where smctl >nul 2>&1
if errorlevel 1 (
    echo smctl not found - skipping signing [local dev build]
    exit /b 0
)

REM Skip signing if PKCS11_CONFIG is not set
if "%PKCS11_CONFIG%"=="" (
    echo PKCS11_CONFIG not set - skipping signing
    exit /b 0
)

echo Signing: %FILE_TO_SIGN%

REM Use certificate fingerprint if available
if not "%SM_CODE_SIGNING_CERT_SHA1_HASH%"=="" (
    smctl sign --fingerprint "%SM_CODE_SIGNING_CERT_SHA1_HASH%" --input "%FILE_TO_SIGN%" --config-file "%PKCS11_CONFIG%"
) else if not "%SM_KEYPAIR_ALIAS%"=="" (
    smctl sign --keypair-alias "%SM_KEYPAIR_ALIAS%" --input "%FILE_TO_SIGN%" --config-file "%PKCS11_CONFIG%"
) else (
    echo No signing credentials set - skipping signing
    exit /b 0
)

if errorlevel 1 (
    echo [ERROR] Failed to sign: %FILE_TO_SIGN%
    exit /b 1
)

echo [SUCCESS] Signed: %FILE_TO_SIGN%
