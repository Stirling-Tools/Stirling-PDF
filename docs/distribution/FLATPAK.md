# Stirling PDF — Flatpak / Flathub Distribution

This document covers building and distributing Stirling PDF as a Flatpak
application, including the process for submitting it to Flathub.

---

## Installing from Flathub

> **Note:** The Stirling PDF Flatpak has not yet been submitted to Flathub.
> Once approved it will be installable with:

```bash
flatpak install flathub org.stirlingtools.StirlingPDF
flatpak run org.stirlingtools.StirlingPDF
```

---

## Building the Flatpak locally

### Prerequisites

```bash
# Flatpak builder and Freedesktop SDK
sudo apt install flatpak flatpak-builder
flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install flathub org.freedesktop.Platform//23.08 org.freedesktop.Sdk//23.08
flatpak install flathub org.freedesktop.Sdk.Extension.rust-stable//23.08
flatpak install flathub org.freedesktop.Sdk.Extension.node20//23.08
```

### Build steps

```bash
# 1. Build the Tauri .deb (requires Rust, Node, JDK 21)
./gradlew :app:core:bootJar
cd frontend && npm ci && npm run tauri build -- --target x86_64-unknown-linux-gnu && cd ..

# 2. Stage the .deb next to the manifest
mkdir -p manifests/flatpak/dist
cp frontend/src-tauri/target/release/bundle/deb/*.deb \
   manifests/flatpak/dist/Stirling-PDF_amd64.deb

# 3. Update the sha256 checksum in the manifest for the .deb source
sha256sum manifests/flatpak/dist/Stirling-PDF_amd64.deb

# 4. Build the Flatpak bundle
flatpak-builder --force-clean build-dir \
  manifests/flatpak/org.stirlingtools.StirlingPDF.yaml

# 5. Create an installable .flatpak file
flatpak-builder --export-only --repo=repo build-dir \
  manifests/flatpak/org.stirlingtools.StirlingPDF.yaml
flatpak build-bundle repo stirling-pdf.flatpak org.stirlingtools.StirlingPDF

# 6. Install and test locally
flatpak install --user stirling-pdf.flatpak
flatpak run org.stirlingtools.StirlingPDF
```

---

## Local testing

### Prerequisites

Install Flatpak tools and the Freedesktop runtime (one-time setup):

```bash
sudo apt install flatpak flatpak-builder

# Add Flathub remote
flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo

# Install the runtime and SDK matching the manifest's runtime-version (23.08)
flatpak install flathub \
  org.freedesktop.Platform//23.08 \
  org.freedesktop.Sdk//23.08 \
  org.freedesktop.Sdk.Extension.rust-stable//23.08 \
  org.freedesktop.Sdk.Extension.node20//23.08
```

### Build, install, and run

```bash
# Build the Flatpak and install it into your user session in one step.
# --force-clean wipes any previous build-dir so you start fresh.
flatpak-builder \
  --user \
  --install \
  --force-clean \
  build-dir \
  manifests/flatpak/org.stirlingtools.StirlingPDF.yaml

# Launch the app
flatpak run org.stirlingtools.StirlingPDF
```

### Checking logs and errors

```bash
# Capture stdout/stderr from the app in a log file
flatpak run org.stirlingtools.StirlingPDF 2>&1 | tee /tmp/stirling-pdf-test.log

# View systemd journal for the Flatpak session unit
journalctl --user -e | grep -i StirlingPDF

# Enable verbose Flatpak sandbox logging (shows permission denials)
FLATPAK_BWRAP_DEBUG=1 flatpak run org.stirlingtools.StirlingPDF
```

### Linting before submission

Flathub runs `flatpak-builder-lint` on every PR. Run it locally first:

```bash
pip install flatpak-builder-lint

# Check the manifest
flatpak-builder-lint manifest manifests/flatpak/org.stirlingtools.StirlingPDF.yaml

# Check the AppStream metainfo
flatpak-builder-lint appstream manifests/flatpak/org.stirlingtools.StirlingPDF.metainfo.xml
```

Resolve all errors before opening the Flathub submission PR. Warnings are
advisory but should be addressed where possible.

### Cleanup

```bash
# Uninstall the locally built app
flatpak uninstall --user org.stirlingtools.StirlingPDF

# Remove build artefacts
rm -rf build-dir repo stirling-pdf.flatpak
```

### Common gotchas

| Problem | Cause | Fix |
|---|---|---|
| `runtime/sdk not found` | Freedesktop runtime not installed | Run the prerequisite install commands above |
| `sha256 mismatch` | `.deb` rebuilt since last checksum | Re-run `sha256sum` and update the manifest source entry |
| Blank/white window | WebKitGTK not available in sandbox | Ensure `org.webkit.webkitgtk` extension is listed in the manifest; check sandbox logs |
| `flatpak-builder: command not found` | Package missing | `sudo apt install flatpak-builder` |
| File open/save dialog fails | Filesystem portal not running | Start `xdg-desktop-portal` and the backend for your desktop environment |
| Sandbox blocks network | Incorrect finish-args | Confirm `--share=network` is present in the manifest's `finish-args` |

---

## Submitting to Flathub

### Requirements

- A GitHub account
- The app must be open source (MIT ✓)
- The Flatpak manifest must pass Flathub linting

### Process

1. **Fork the Flathub repository**
   <https://github.com/flathub/flathub>

2. **Open a new app submission issue**
   <https://github.com/flathub/flathub/issues/new?template=new_application.yml>
   Fill in the app ID (`org.stirlingtools.StirlingPDF`), project URL, and a
   link to the manifest.

3. **Create a dedicated app repository**
   Flathub requires each app to have its own repository named after the app ID:
   `https://github.com/flathub/org.stirlingtools.StirlingPDF`
   This is created by the Flathub team after your issue is reviewed.

4. **Submit a pull request** to the app repository with:
   - `org.stirlingtools.StirlingPDF.yaml` — the Flatpak manifest
   - `org.stirlingtools.StirlingPDF.metainfo.xml` — AppStream metadata

5. **Flathub review** — the Flathub team will review the manifest for policy
   compliance and may request changes.

6. **CI validation** — once merged, Flathub's build system will automatically
   build and publish the app.

### Useful resources

- Flathub submission guidelines: <https://docs.flathub.org/docs/for-app-authors/submission>
- Flatpak manifest reference: <https://docs.flatpak.org/en/latest/manifests.html>
- AppStream metadata spec: <https://www.freedesktop.org/software/appstream/docs/>
- Flathub linter: <https://github.com/flathub-infra/flatpak-builder-lint>

---

## Sandbox limitations

Flatpak applications run inside a sandbox. This affects Stirling PDF in the
following ways:

| Feature | Status | Notes |
|---|---|---|
| Core PDF operations | ✅ Fully supported | Built into the JAR |
| Image conversion | ✅ Fully supported | Built into the JAR |
| Office → PDF (LibreOffice) | ❌ Not available | Cannot reach host LibreOffice |
| OCR (Tesseract) | ❌ Not available | Cannot reach host Tesseract |
| Ghostscript compression | ❌ Not available | Cannot reach host Ghostscript |
| File access | ✅ Home directory | Via `--filesystem=home` |
| Network | ✅ Enabled | For remote URL operations |

For full functionality including LibreOffice and Tesseract support, use the
Docker image or the native `.deb`/`.rpm` package.

---

## Updating the Flatpak manifest

When a new Stirling PDF version is released:

1. Update the `version` field in `tauri.conf.json`
2. Rebuild the Tauri `.deb` and compute its new SHA256
3. Update the `sha256` value for the `.deb` source in the manifest
4. Update the `<release>` entry in `org.stirlingtools.StirlingPDF.metainfo.xml`
5. Submit a pull request to the Flathub app repository
