# Stirling PDF — Snap Distribution

Stirling PDF is distributed as two separate snaps:

| Snap name | Type | Description |
|---|---|---|
| `stirling-pdf` | Desktop app | Tauri GUI + embedded backend |
| `stirling-pdf-server` | Daemon | Headless web server on port 8080 |

---

## Installing from the Snap Store

```bash
# Desktop application
sudo snap install stirling-pdf --classic

# Headless server daemon
sudo snap install stirling-pdf-server
```

> **`--classic` confinement** is required for the desktop snap so that
> optional external tools installed on the host (LibreOffice, Tesseract OCR,
> etc.) can be discovered and called by Stirling PDF at runtime.
> The server snap uses strict confinement because it only needs network access.

---

## Running the desktop app

After installation, launch from the application menu or run:

```bash
stirling-pdf
```

The embedded Spring Boot backend starts automatically and the Tauri window
opens pointing at `http://localhost:8080`.

### Configuration

| Environment variable | Default | Description |
|---|---|---|
| `STIRLING_PDF_PORT` | `8080` | Port the backend listens on |

Set variables in the snap environment:

```bash
sudo snap set stirling-pdf stirling-pdf-port=9090
```

User data is stored in `$SNAP_USER_DATA` (typically
`~/snap/stirling-pdf/current/`).

---

## Running the server daemon

```bash
# Check service status
sudo snap services stirling-pdf-server

# Start / stop / restart
sudo snap start stirling-pdf-server.stirling-pdf-server
sudo snap stop  stirling-pdf-server.stirling-pdf-server
sudo snap restart stirling-pdf-server.stirling-pdf-server

# View logs
sudo snap logs stirling-pdf-server -f
```

The web UI is available at **http://localhost:8080** once the service is
running.

### Configuration

```bash
# Change the listening port
sudo snap set stirling-pdf-server stirling-pdf-port=9090
sudo snap restart stirling-pdf-server.stirling-pdf-server
```

Data and logs are stored under `/var/snap/stirling-pdf-server/current/`.

---

## Building the snaps locally

### Prerequisites

```bash
sudo snap install snapcraft --classic
sudo snap install lxd
sudo lxd init --minimal
```

### Desktop snap

```bash
# 1. Build the Tauri .deb (requires Rust, Node, JDK 21)
./gradlew :app:core:bootJar
cd frontend && npm ci && npm run tauri build && cd ..

# 2. Stage the artifact
mkdir -p manifests/snap/dist
cp frontend/src-tauri/target/release/bundle/deb/*.deb manifests/snap/dist/

# 3. Build the snap
cd manifests/snap
snapcraft --use-lxd

# 4. (Optional) Install and test locally
sudo snap install stirling-pdf_*.snap --dangerous --classic
```

### Server snap

```bash
# 1. Build the JAR
./gradlew :app:core:bootJar

# 2. Stage the artifact
mkdir -p manifests/snap/dist
cp app/core/build/libs/Stirling-PDF*.jar manifests/snap/dist/

# 3. Build the snap
cd manifests/snap
snapcraft --use-lxd --file snapcraft-server.yaml

# 4. (Optional) Install and test locally
sudo snap install stirling-pdf-server_*.snap --dangerous
```

---

## Local testing

### LXD setup (required for `--use-lxd`)

```bash
sudo snap install lxd
sudo lxd init --minimal

# Add your user to the lxd group, then log out and back in
sudo usermod -aG lxd $USER
newgrp lxd   # apply without logging out (current shell only)
```

### Testing the desktop snap

```bash
cd manifests/snap
snapcraft --use-lxd

# Install the locally built snap (--dangerous bypasses signature check)
sudo snap install --dangerous --classic stirling-pdf_*.snap

# Launch and verify the UI opens
snap run stirling-pdf

# Check logs if the app fails to start
snap logs stirling-pdf -n 100
journalctl -u snap.stirling-pdf.stirling-pdf --no-pager | tail -50

# Cleanup
sudo snap remove stirling-pdf
rm -f stirling-pdf_*.snap
```

### Testing the server snap

```bash
cd manifests/snap
snapcraft --use-lxd --file snapcraft-server.yaml

sudo snap install --dangerous stirling-pdf-server_*.snap

# Verify the daemon started
sudo snap services stirling-pdf-server
curl -sf http://localhost:8080/api/v1/info | python3 -m json.tool

# Follow live logs
sudo snap logs stirling-pdf-server -f

# Cleanup
sudo snap remove stirling-pdf-server
rm -f stirling-pdf-server_*.snap
```

### Common gotchas

| Problem | Cause | Fix |
|---|---|---|
| `lxd: permission denied` | User not in `lxd` group | `sudo usermod -aG lxd $USER` then log out/in |
| `classic confinement not available` | LXD container blocks classic | Build on host directly: `snapcraft` (without `--use-lxd`) |
| `cannot find snap` after install | Shell not refreshed | Open a new terminal or run `hash -r` |
| Port 8080 already in use | Conflicting local service | `sudo lsof -i :8080` — identify and stop the process |
| App starts but UI is blank | Missing display server integration | Ensure `DISPLAY` or `WAYLAND_DISPLAY` is set; test with `echo $DISPLAY` |
| `snap logs` returns nothing | systemd journal rotated | Try `journalctl -u snap.stirling-pdf.* -e` |

---

## Publishing to the Snap Store

### One-time setup

1. Create a developer account at <https://snapcraft.io>
2. Register the snap names:
   ```bash
   snapcraft register stirling-pdf
   snapcraft register stirling-pdf-server
   ```
3. Generate store credentials and add them as a GitHub Actions secret named
   `SNAPCRAFT_STORE_CREDENTIALS`:
   ```bash
   snapcraft export-login --snaps stirling-pdf,stirling-pdf-server \
     --channels stable,candidate,beta,edge - | base64
   ```

### Automated publishing (CI)

The workflow at `.github/workflows/snap-publish.yml` runs automatically on
every GitHub release and publishes both snaps to the `stable` channel.
Manual workflow dispatch allows publishing to `edge` or `candidate`.

### Manual push

```bash
snapcraft upload stirling-pdf_*.snap --release=stable
snapcraft upload stirling-pdf-server_*.snap --release=stable
```

---

## External tool support

Because the desktop snap uses **classic confinement**, it can call external
tools installed on the host:

| Tool | Install | Purpose |
|---|---|---|
| LibreOffice | `sudo apt install libreoffice` | Office ↔ PDF conversion |
| Tesseract | `sudo apt install tesseract-ocr` | OCR processing |
| Ghostscript | `sudo apt install ghostscript` | PDF compression/repair |

The server snap (strict confinement) cannot reach host binaries. Use the
Docker image or native `.deb` package when you need full tool integration
in a server context.
