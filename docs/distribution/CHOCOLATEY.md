# Stirling PDF — Chocolatey Distribution

Stirling PDF is distributed via Chocolatey as two packages:

| Package ID | Description |
|---|---|
| `stirling-pdf` | Desktop application (installs the MSI) |
| `stirling-pdf-server` | Headless server — runs as a Windows service on port 8080 |

---

## Installing via Chocolatey

```powershell
# Desktop application
choco install stirling-pdf

# Headless server (installs and starts a Windows service)
choco install stirling-pdf-server
```

### Upgrading

```powershell
choco upgrade stirling-pdf
choco upgrade stirling-pdf-server
```

### Uninstalling

```powershell
choco uninstall stirling-pdf
choco uninstall stirling-pdf-server
```

---

## Desktop package (`stirling-pdf`)

The desktop package downloads and runs the official MSI installer, which
installs the Tauri + Spring Boot application with a bundled JRE.

After installation:
- Launch from the **Start Menu** or **desktop shortcut**
- The embedded backend starts automatically when the app is opened
- No separate Java installation is needed

### MSI silent install flags

The installer uses `/quiet /norestart ALLUSERS=1` by default.

---

## Server package (`stirling-pdf-server`)

The server package:
1. Downloads the Spring Boot JAR to `C:\ProgramData\StirlingPDF\`
2. Downloads and unpacks a Temurin JRE 21 to
   `C:\ProgramData\StirlingPDF\jre\`
3. Registers a Windows service named **`StirlingPDFServer`** via
   [NSSM](https://nssm.cc/) and starts it automatically

The web UI is available at **http://localhost:8080** after installation.

### Managing the service

```powershell
# Check status
Get-Service StirlingPDFServer

# Start / stop / restart
Start-Service StirlingPDFServer
Stop-Service  StirlingPDFServer
Restart-Service StirlingPDFServer

# Or via NSSM
nssm status StirlingPDFServer
nssm start  StirlingPDFServer
nssm stop   StirlingPDFServer
```

### File locations

| Path | Contents |
|---|---|
| `C:\ProgramData\StirlingPDF\Stirling-PDF-*.jar` | Application JAR |
| `C:\ProgramData\StirlingPDF\jre\` | Bundled Temurin JRE 21 |
| `C:\ProgramData\StirlingPDF\data\` | User data and settings |
| `C:\ProgramData\StirlingPDF\logs\` | Log files |

### Changing the port

Edit the service parameters via NSSM GUI:

```powershell
nssm edit StirlingPDFServer
```

Or update the `AppParameters` key directly and restart the service.

---

## Building the packages locally

### Prerequisites

```powershell
# Install Chocolatey (if not already installed)
Set-ExecutionPolicy Bypass -Scope Process -Force
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

### Desktop package

```powershell
# 1. Build the MSI via the Tauri workflow (or download from GitHub Releases)

# 2. Update version and checksum in the nuspec and install script
$version = "2.7.3"
$msiHash = (Get-FileHash "Stirling-PDF_${version}_x64_en-US.msi" -Algorithm SHA256).Hash.ToLower()

# 3. Pack
cd manifests/chocolatey/stirling-pdf
choco pack stirling-pdf.nuspec

# 4. Test install locally
choco install stirling-pdf --source . --pre -y
```

### Server package

```powershell
# 1. Build the JAR
./gradlew :app:core:bootJar

# 2. Update version and checksum in the nuspec and install script
$version = "2.7.3"
$jarHash = (Get-FileHash "Stirling-PDF-${version}.jar" -Algorithm SHA256).Hash.ToLower()

# 3. Pack
cd manifests/chocolatey/stirling-pdf-server
choco pack stirling-pdf-server.nuspec

# 4. Test install locally (requires nssm to be installed)
choco install stirling-pdf-server --source . --pre -y
```

---

## Publishing to the Chocolatey Community Repository

### One-time setup

1. Create an account at <https://community.chocolatey.org>
2. Generate an API key from your account page
3. Add the key as a GitHub Actions secret named `CHOCOLATEY_API_KEY`

### Automated publishing (CI)

The workflow at `.github/workflows/chocolatey-publish.yml` runs automatically
on every GitHub release. It:

1. Extracts the version from Gradle
2. Downloads the release artifacts and computes SHA256 checksums
3. Patches the version and checksum placeholders in the install scripts
4. Runs `choco pack` and `choco push`

Manual workflow dispatch lets you push just the `desktop`, just the `server`,
or `both` packages.

### Manual push

```powershell
choco push stirling-pdf.2.7.3.nupkg --source https://push.chocolatey.org/ --api-key YOUR_API_KEY
choco push stirling-pdf-server.2.7.3.nupkg --source https://push.chocolatey.org/ --api-key YOUR_API_KEY
```

> **Note:** New package submissions to the Chocolatey community repository
> undergo a moderation review before being publicly available. Allow 1–3 days
> for initial approval. Updates to approved packages are typically
> auto-approved within minutes.

---

## Useful resources

- Chocolatey package creation guide: <https://docs.chocolatey.org/en-us/create/create-packages>
- Chocolatey nuspec reference: <https://docs.chocolatey.org/en-us/create/create-packages#nuspec>
- NSSM (service manager): <https://nssm.cc/usage>
- Flathub submission (for Linux): see `docs/distribution/FLATPAK.md`
- Snap Store (for Linux): see `docs/distribution/SNAP.md`
