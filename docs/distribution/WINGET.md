# Publishing Stirling-PDF to winget

This document explains how to get Stirling-PDF listed in the Windows Package Manager (winget)
and how to keep releases automatically in sync.

---

## One-time setup

### 1. Submit the initial PR to microsoft/winget-pkgs

The very first submission must be done manually so the winget team can review the package.

1. Fork [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs).
2. Copy the three manifest files from `manifests/winget/` into the correct path inside the fork:

   ```
   manifests/s/StirlingTools/StirlingPDF/2.7.3/
   ├── StirlingTools.StirlingPDF.yaml
   ├── StirlingTools.StirlingPDF.locale.en-US.yaml
   └── StirlingTools.StirlingPDF.installer.yaml
   ```

3. Before opening the PR, update `InstallerSha256` in the installer manifest with the real
   SHA-256 of the published `.msi` file:

   ```powershell
   Get-FileHash .\Stirling-PDF-windows-x86_64.msi -Algorithm SHA256
   ```

   Or on Linux/macOS:

   ```bash
   sha256sum Stirling-PDF-windows-x86_64.msi
   ```

4. Open a pull request against `microsoft/winget-pkgs`. The title should follow the required
   format: `New package: StirlingTools.StirlingPDF version 2.7.3`.

5. The winget validation bot will run automated checks. Fix any reported issues, then wait for
   human review. Initial reviews usually take a few days to a couple of weeks.

6. Once the PR is merged, `winget install StirlingTools.StirlingPDF` will work for all Windows
   users.

---

### 2. Create the WINGET_TOKEN secret

After the initial package is accepted, subsequent releases are submitted automatically by the
`winget-publish.yml` workflow using `vedantmgoyal9/winget-releaser`.

The workflow needs a GitHub Personal Access Token (PAT) with permission to open pull requests
against `microsoft/winget-pkgs`.

**Steps:**

1. Go to <https://github.com/settings/tokens> and generate a **Classic** PAT with the
   `public_repo` scope (or a fine-grained token scoped to `microsoft/winget-pkgs` with
   *Contents: read & write* and *Pull requests: read & write*).

2. In the Stirling-PDF repository, go to
   **Settings → Secrets and variables → Actions → New repository secret**.

3. Name the secret `WINGET_TOKEN` and paste the PAT as the value.

4. Save.

From this point on, every time a GitHub Release is published the workflow will:
- Download the release's `.msi` asset.
- Compute its SHA-256.
- Open a PR to `microsoft/winget-pkgs` with an updated manifest.

---

## How the automation works

The workflow file is at `.github/workflows/winget-publish.yml`. It triggers on the
`release: published` event and calls the
[vedantmgoyal9/winget-releaser](https://github.com/vedantmgoyal9/winget-releaser) action, which:

1. Finds the `.msi` asset in the release that matches `Stirling-PDF-windows-x86_64.msi`.
2. Builds a new set of manifests with the correct version and SHA-256.
3. Opens a PR against `microsoft/winget-pkgs` using the `WINGET_TOKEN`.

No manual steps are needed after the initial submission.

---

## License notes

Stirling-PDF uses an **Open Core** model. The canonical license URL for all manifests is:

```
https://github.com/Stirling-Tools/Stirling-PDF/blob/main/LICENSE
```

Never use `stirlingpdf.com/terms` as the license URL in any manifest.

For the license identifier, use whichever option the platform supports best:

| Platform supports | Use |
|-------------------|-----|
| Free-text / custom field | `Open Core` |
| SPDX identifiers only | `LicenseRef-OpenCore` |
| Known identifiers only (e.g. winget fallback) | `Proprietary` for desktop, `MIT` for server JAR |

The desktop app (`frontend/src/desktop/`) is proprietary. The server JAR (`app/core/`) is
MIT-licensed. Winget's `License` field is free-text, so the manifest uses `Open Core`.

---

## Local testing

Validate manifests locally before opening a PR to `microsoft/winget-pkgs` to catch errors
that would otherwise stall the review.

### Prerequisites

```powershell
# Install the winget client (already present on Windows 11; on Windows 10 install from the Store)
# Install wingetcreate
winget install Microsoft.WingetCreate
```

### 1. Validate manifest structure

`winget validate` checks syntax, required fields, and schema conformance:

```powershell
# From the repo root — point at the folder containing the three YAML files
winget validate manifests\winget\
```

A clean run prints `Manifest validation succeeded.` with no errors.

**Common gotchas:**

- `PackageVersion` must be a pure semver string (`2.7.3`, not `v2.7.3`).
- `InstallerUrl` must be HTTPS and publicly reachable. If you are testing against a pre-release
  or a local build, temporarily host the `.msi` somewhere public (e.g. a GitHub release draft).
- `InstallerSha256` must match the file at `InstallerUrl` exactly. Recompute it whenever the
  `.msi` changes.
- Trailing whitespace in YAML causes schema errors that can be hard to spot — run your editor's
  "trim trailing whitespace" pass before validating.

### 2. Dry-run a PR submission

`wingetcreate submit --test` generates the updated manifests and opens a **test** PR against a
sandbox fork instead of the real `microsoft/winget-pkgs`:

```powershell
wingetcreate submit `
  --token "$env:WINGET_TOKEN" `
  --test `
  StirlingTools.StirlingPDF
```

This lets you see exactly what the PR will look like, including the diff, without touching the
real repository.

**Note:** `--test` requires the `WINGET_TOKEN` PAT (same one used by the CI workflow). If the
token is not set as an environment variable, pass it directly with `--token <your-pat>`.

### 3. Install from a local manifest (end-to-end smoke test)

Once `winget validate` passes, install the package directly from the local manifest files to
confirm the installer actually runs:

```powershell
# Requires running as Administrator or in a dev environment with Developer Mode enabled
winget install --manifest manifests\winget\
```

This downloads the `.msi` from `InstallerUrl`, verifies the hash, and runs the installer — the
same path a real user would follow.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Workflow fails with `403` | `WINGET_TOKEN` expired or missing | Regenerate and update the secret |
| winget-pkgs PR blocked by validation | Manifest field formatting | Check the PR comments from the `winget-bot` and update the manifests in `manifests/winget/` |
| `InstallerSha256` mismatch | Stale placeholder in manifests | The automation recalculates the hash; the placeholder in-repo only matters for the initial manual PR |
