# Verifying Stirling-PDF Release Artifacts

Every Linux release artifact (`.AppImage`, `.rpm`, `.deb`) is signed with the
**Stirling-PDF release signing key**. Users are encouraged to verify downloads
before running them, especially when obtaining Stirling-PDF from a mirror,
redistributor, or any source other than the official
[GitHub Releases page](https://github.com/Stirling-Tools/Stirling-PDF/releases).

## Signing key

| Field        | Value                                              |
|--------------|----------------------------------------------------|
| User ID      | `Stirling PDF Inc. <contact@stirlingpdf.com>`      |
| Fingerprint  | `EBB9 258B FEA4 7D92 342F  00DF B8C0 96A5 9BEF 2A8B` |
| Algorithm    | RSA-4096                                           |
| Valid until  | 2031-04-16                                         |

The public key is committed to this repository at
[`docs/security/signing-key.pub`](signing-key.pub) and is also published on:

- https://keys.openpgp.org/search?q=EBB9258BFEA47D92342F00DFB8C096A59BEF2A8B
- https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xEBB9258BFEA47D92342F00DFB8C096A59BEF2A8B

Cross-checking the fingerprint from two independent sources (the repository and
a keyserver) is the recommended way to be sure you've obtained the genuine key.

## One-time setup — import the public key

```bash
# Option 1 — from the repo over HTTPS
curl -fsSL https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/security/signing-key.pub \
  | gpg --import

# Option 2 — from a keyserver
gpg --keyserver hkps://keys.openpgp.org \
    --recv-keys EBB9258BFEA47D92342F00DFB8C096A59BEF2A8B
```

Confirm the fingerprint matches after import:

```bash
gpg --fingerprint contact@stirlingpdf.com
# Expected: EBB9 258B FEA4 7D92 342F  00DF B8C0 96A5 9BEF 2A8B
```

## Verifying an `.AppImage`

Tauri's AppImage bundler embeds the signature inside the AppImage itself via
`appimagetool --sign`. Extract and verify:

```bash
# --appimage-signature prints the embedded signature
./Stirling-PDF_*.AppImage --appimage-signature > sig.asc
./Stirling-PDF_*.AppImage --appimage-offset                  # shows the offset
# Verify the payload signature against the key
gpg --verify sig.asc Stirling-PDF_*.AppImage
```

A successful result looks like:

```
gpg: Good signature from "Stirling PDF Inc. <contact@stirlingpdf.com>" [ultimate]
```

## Verifying an `.rpm`

RPM signatures are verified via `rpm --checksig`:

```bash
# Import the key into rpm's keyring
sudo rpm --import docs/security/signing-key.pub   # if working from a clone
# OR
sudo rpm --import https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/security/signing-key.pub

# Verify the package
rpm --checksig Stirling-PDF-*.rpm
# Expected output ends with: "digests signatures OK"
```

## Verifying a `.deb`

Debian packages are signed with a detached `.asc` file distributed alongside
the `.deb` on the release page:

```bash
gpg --verify Stirling-PDF-*.deb.asc Stirling-PDF-*.deb
```

## What if verification fails?

A failed signature check means **do not install the file**. Possible causes:

- The download was corrupted — try again from the
  [official releases](https://github.com/Stirling-Tools/Stirling-PDF/releases).
- You obtained the file from a malicious mirror — get it from the official
  source.
- The signing key has rotated — check this document on the latest `main` for
  the current fingerprint.

If none of those explain it, please open a security report at
https://github.com/Stirling-Tools/Stirling-PDF/security/advisories/new.

## Key rotation policy

The signing key expires on **2031-04-16**. We will publish a new key at least
six months before expiry. The transition process:

1. A new key is announced in release notes and this document is updated.
2. The last few releases will be co-signed with both the old and new keys.
3. The old key is published with a revocation notice once the transition is
   complete.

If the signing key is ever compromised, a revocation certificate will be
published immediately to both keyservers and to this document.
