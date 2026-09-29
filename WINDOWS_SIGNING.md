# Windows Code Signing Setup Guide

This guide explains how to set up Windows code signing for Stirling-PDF desktop application builds.

## Overview

Releases are signed with **DigiCert KeyLocker**, a cloud HSM: the private key never
leaves DigiCert, and the runner signs through a PKCS#11 provider. The older approach
of uploading a base64 `.pfx` to a repository secret has been removed from the
workflows - the sections below describe KeyLocker, which is what actually runs.

Windows code signing is essential for:
- Preventing Windows SmartScreen warnings
- Building trust with users
- Enabling Microsoft Store distribution
- Professional application distribution

## Certificate Types

### OV Certificate (Organization Validated)
- More affordable option
- Requires business verification
- May trigger SmartScreen warnings initially until reputation builds
- Suitable for most independent software vendors

### EV Certificate (Extended Validation)
- Premium option with immediate SmartScreen reputation
- Requires hardware security module (HSM) or cloud-based signing
- Higher cost but provides immediate trust
- Required since June 2023 for new certificates

## Obtaining a Certificate

### Certificate Authorities
Popular certificate authorities for Windows code signing:
- DigiCert
- Sectigo (formerly Comodo)
- GlobalSign
- SSL.com

### Certificate Format
You'll receive a certificate in one of these formats:
- `.pfx` or `.p12` (preferred - contains both certificate and private key)
- `.cer` + private key (needs conversion to .pfx)

### Converting to PFX (if needed)
If you have separate certificate and private key files:

```bash
openssl pkcs12 -export -out certificate.pfx -inkey private-key.key -in certificate.cer
```

## Setting Up GitHub Secrets

### Required Secrets

Navigate to your GitHub repository → Settings → Environments → `release-signing`.

These live in the `release-signing` environment, not at repository scope. That
environment requires reviewer approval and is limited to `main`, `release`,
`hotfix/*` and `v*` tags. All five come from the DigiCert ONE console.

| Secret | Description |
| --- | --- |
| `SM_API_KEY` | KeyLocker API key. Also acts as the on/off switch: signing steps are gated on it being non-empty. |
| `SM_CLIENT_CERT_FILE_B64` | Base64-encoded PKCS#12 client authentication certificate. |
| `SM_CLIENT_CERT_PASSWORD` | Password for that client certificate. |
| `SM_KEYPAIR_ALIAS` | Alias of the signing keypair to use. |
| `SM_HOST` | DigiCert ONE host, e.g. `https://clientauth.one.digicert.com`. |

### Optional Secrets for Tauri Updater

If you're using Tauri's built-in updater feature:

#### `TAURI_SIGNING_PRIVATE_KEY`
- Generated using Tauri CLI: `npm run tauri signer generate`
- Used for update package verification

#### `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Password for the Tauri signing key

## Configuration Files

### 1. Tauri Configuration (frontend/editor/src-tauri/tauri.conf.json)

The Windows signing configuration is already set up:

```json
"windows": {
  "certificateThumbprint": null,
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

**Configuration Options:**
- `certificateThumbprint`: Automatically extracted from imported certificate (leave as `null`)
- `digestAlgorithm`: Hashing algorithm - `sha256` is recommended
- `timestampUrl`: Timestamp server to prove signing time (survives certificate expiration)

**Alternative Timestamp Servers:**
- DigiCert: `http://timestamp.digicert.com`
- Sectigo: `http://timestamp.sectigo.com`
- GlobalSign: `http://timestamp.globalsign.com`

### 2. GitHub Workflow (.github/workflows/tauri-build.yml)

The workflow includes four Windows signing steps, all gated on `SM_API_KEY` being
set and the ref being the release branch:

1. **Setup DigiCert KeyLocker**: Installs the DigiCert signing tools via `digicert/ssm-code-signing`
2. **Setup DigiCert KeyLocker Certificate**: Writes the client cert and exports the PKCS#11 config
3. **Configure Windows code signing / Build Tauri app**: Signs through the PKCS#11 provider
4. **Verify Windows Code Signature**: Validates that the .exe and .msi are properly signed

## Testing the Setup

### 1. Local Testing (Windows Only)

KeyLocker is CI-only. To check signing locally, install your own certificate into
the Windows store and point Tauri at it; the build no longer reads any certificate
from an environment variable.

```powershell
# Build the application
cd frontend
npm run tauri build

# Verify the signature
Get-AuthenticodeSignature "./src-tauri/target/release/bundle/msi/Stirling-PDF_*.msi"
```

### 2. GitHub Actions Testing

1. Push your changes to a branch
2. Manually trigger the workflow:
   - Go to Actions → Build Tauri Applications
   - Click "Run workflow"
   - Select "windows" platform
3. Check the build logs for:
   - ✅ Certificate import success
   - ✅ Build completion
   - ✅ Signature verification

### 3. Verifying Signed Binaries

After downloading the built artifacts:

**Windows (PowerShell):**
```powershell
Get-AuthenticodeSignature "Stirling-PDF-windows-x86_64.exe"
Get-AuthenticodeSignature "Stirling-PDF-windows-x86_64.msi"
```

Look for:
- Status: `Valid`
- Signer: Your organization name
- Timestamp: Recent date/time

**Windows (GUI):**
1. Right-click the .exe or .msi file
2. Select "Properties"
3. Go to "Digital Signatures" tab
4. Verify signature details

## Troubleshooting

### "HashMismatch" Status
- Certificate doesn't match the binary
- Possible file corruption during download
- Re-download and verify

### "NotSigned" Status
- Certificate wasn't imported correctly
- Check GitHub secrets are set correctly
- Verify base64 encoding is complete (no truncation)

### "UnknownError" Status
- Timestamp server unreachable
- Try alternative timestamp URL in tauri.conf.json
- Check network connectivity in GitHub Actions

### SmartScreen Still Shows Warnings
- Normal for OV certificates initially
- Reputation builds over time with user downloads
- Consider EV certificate for immediate reputation

### Certificate Not Found During Build
- Verify `SM_API_KEY` is present in the `release-signing` environment. If it is empty
  the signing steps skip silently and the build succeeds unsigned.
- Check `SM_CLIENT_CERT_FILE_B64` base64 encoding is correct (no extra whitespace)
- Ensure `SM_CLIENT_CERT_PASSWORD` and `SM_KEYPAIR_ALIAS` match the DigiCert keypair

## Security Best Practices

1. **Never commit certificates to version control**
   - Keep .pfx files secure and backed up
   - Use GitHub secrets for CI/CD

2. **Rotate certificates before expiration**
   - Set calendar reminders
   - Update GitHub secrets with new certificate

3. **Use strong passwords**
   - Certificate password should be complex
   - Store securely (password manager)

4. **Monitor certificate usage**
   - Review GitHub Actions logs
   - Set up notifications for failed builds

5. **Limit access to secrets**
   - Only repository admins should access secrets
   - Audit secret access regularly

## Certificate Lifecycle

### Before Expiration
1. Renew the certificate in the DigiCert ONE console (typically annual)
2. If the keypair alias changed, update `SM_KEYPAIR_ALIAS` in the `release-signing` environment
3. If the client authentication certificate was reissued, update `SM_CLIENT_CERT_FILE_B64` and `SM_CLIENT_CERT_PASSWORD`
4. Test build to verify the new certificate works

### Expired Certificates
- Signed binaries remain valid (timestamp proves signing time)
- New builds will fail until certificate is renewed
- Users can still install previously signed versions

## Cost Considerations

### Certificate Costs (Annual, as of 2024)
- **OV Certificate**: $100-400/year
- **EV Certificate**: $400-1000/year

### Choosing the Right Certificate
- **Open source / early stage**: Start with OV
- **Commercial / enterprise**: Consider EV for better trust
- **Microsoft Store**: EV certificate required

## Additional Resources

- [Tauri Windows Signing Documentation](https://v2.tauri.app/distribute/sign/windows/)
- [Microsoft Code Signing Overview](https://docs.microsoft.com/windows/win32/seccrypto/cryptography-tools)
- [DigiCert Code Signing Guide](https://www.digicert.com/signing/code-signing-certificates)
- [Windows SmartScreen FAQ](https://support.microsoft.com/windows/smartscreen-faq)

## Support

If you encounter issues with Windows code signing:
1. Check GitHub Actions logs for detailed error messages
2. Verify all secrets are set correctly
3. Test certificate locally first (Windows environment required)
4. Open an issue in the repository with relevant logs (remove sensitive data)
