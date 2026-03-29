# AppImage — local testing

The AppImage build is produced automatically by Tauri when `"appimage"` is listed in the
`targets` array of `frontend/src-tauri/tauri.conf.json`. It is uploaded to GitHub Releases
alongside the `.deb` artifact.

---

## Prerequisites

- A Linux machine or WSL2 instance (Ubuntu 22.04+ recommended).
- `libfuse2` — required by all AppImages built with the current AppImage runtime:

  ```bash
  sudo apt-get install libfuse2   # Debian / Ubuntu
  sudo dnf install fuse-libs      # Fedora / RHEL
  ```

  On Ubuntu 22.04+ `libfuse2` is no longer installed by default; this is the single most
  common reason an AppImage fails to launch.

---

## Running the AppImage

```bash
# 1. Download (or build) the AppImage
#    From a GitHub Release:
curl -L -O https://github.com/Stirling-Tools/Stirling-PDF/releases/download/vX.Y.Z/Stirling-PDF_X.Y.Z_amd64.AppImage

# 2. Make it executable (only needed once)
chmod +x Stirling-PDF_*.AppImage

# 3. Launch
./Stirling-PDF_*.AppImage
```

The app should open a browser window (or system tray icon) pointing at `http://localhost:8080`.

---

## Smoke-test checklist

| Check | Expected result |
|-------|-----------------|
| Launch without arguments | App starts, UI loads at `http://localhost:8080` |
| Upload a PDF and convert | Operation completes successfully |
| Close the window / tray | Process exits cleanly (no zombie) |
| Re-launch immediately | Port is free, app starts again without errors |

---

## Local build (without a full release)

If you want to test an AppImage from a local Tauri build rather than a published release:

```bash
cd frontend
npm run tauri build
# Output is at:
#   src-tauri/target/release/bundle/appimage/Stirling-PDF_*.AppImage
chmod +x src-tauri/target/release/bundle/appimage/Stirling-PDF_*.AppImage
./src-tauri/target/release/bundle/appimage/Stirling-PDF_*.AppImage
```

---

## Common gotchas

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `fuse: device not found` or `FUSE library not found` | `libfuse2` missing | `sudo apt-get install libfuse2` |
| AppImage exits immediately with no output | Missing shared library | Run with `./Stirling-PDF_*.AppImage --appimage-extract-and-run` to bypass FUSE and surface the real error |
| Port 8080 already in use | Another process bound to the port | `lsof -i :8080` to identify and kill it, then re-launch |
| Blank window / white screen | Webview renderer issue | Ensure `libwebkit2gtk-4.0` or `libwebkit2gtk-4.1` is installed |
| Works in terminal but not double-click from file manager | Executable bit lost on download | Re-run `chmod +x` on the file |

---

## Extracting the AppImage for inspection

To inspect the contents without running the app (useful for debugging or verifying bundled files):

```bash
./Stirling-PDF_*.AppImage --appimage-extract
# Creates a ./squashfs-root/ directory with the full app tree
```
