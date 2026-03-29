# Stirling-PDF — Distribution Channels

This document gives an overview of all supported package manager and platform
distribution channels for Stirling-PDF.

---

## Status

| Channel | Type | Status | Setup needed |
|---------|------|--------|--------------|
| [APT / Debian](#apt--debian) | deb | Needs setup | GPG key + Pages config |
| [RPM / COPR](#rpm--copr) | rpm | Needs setup | FAS account + COPR project |
| [Nix / Flakes](#nix--flakes) | nix | Ready (local) | Version + sha256 per release |
| [systemd service](#systemd-service) | Linux | Ready | Ship with deb/rpm |
| [Windows service (WinSW)](#windows-service-winsw) | Windows | Ready | Ship with release assets |
| Docker / Docker Hub | container | Existing | — |

---

## APT / Debian

**User install:**

```bash
curl -fsSL https://stirling-tools.github.io/Stirling-PDF/KEY.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/stirling-pdf.gpg

echo "deb [arch=amd64 signed-by=/usr/share/keyrings/stirling-pdf.gpg] \
  https://stirling-tools.github.io/Stirling-PDF stable main" \
  | sudo tee /etc/apt/sources.list.d/stirling-pdf.list

sudo apt update && sudo apt install stirling-pdf
```

**Maintainer setup:** [docs/distribution/APT.md](APT.md)

**Workflow:** [.github/workflows/apt-repo.yml](../../.github/workflows/apt-repo.yml)

**Secrets required:**

| Secret | Description |
|--------|-------------|
| `APT_GPG_PRIVATE_KEY` | Armored GPG private key |
| `APT_GPG_PASSPHRASE` | Passphrase for the GPG key |

---

## RPM / COPR

**User install (Fedora / RHEL / CentOS):**

```bash
sudo dnf copr enable @stirling-tools/stirling-pdf
sudo dnf install stirling-pdf
```

**Maintainer setup:** [docs/distribution/RPM.md](RPM.md)

**Workflow:** [.github/workflows/copr-publish.yml](../../.github/workflows/copr-publish.yml)

**Secrets / Variables required:**

| Name | Type | Description |
|------|------|-------------|
| `COPR_API_TOKEN` | Secret | COPR API token |
| `COPR_LOGIN` | Variable | COPR login field from API page |
| `COPR_USERNAME` | Variable | FAS username |
| `COPR_PROJECT_NAME` | Variable | COPR project name (`stirling-pdf`) |

---

## Nix / Flakes

**User install / run:**

```bash
# Run server directly
nix run github:Stirling-Tools/Stirling-PDF

# Install server
nix profile install github:Stirling-Tools/Stirling-PDF#stirling-pdf-server

# Run desktop (proprietary — requires allowUnfree)
NIXPKGS_ALLOW_UNFREE=1 nix run github:Stirling-Tools/Stirling-PDF#stirling-pdf-desktop --impure
```

**Files:**

| File | Purpose |
|------|---------|
| `manifests/nix/flake.nix` | Flake entry point |
| `manifests/nix/server.nix` | Server JAR expression (MIT) |
| `manifests/nix/default.nix` | Desktop app expression (Proprietary) |

**Maintainer setup:** [docs/distribution/NIX.md](NIX.md)

**Action required per release:** Update `version`, `serverSha256`, and
`desktopSha256` in `manifests/nix/flake.nix`.

---

## systemd Service

Included in the deb / rpm packages and available standalone.

**Files:**

| File | Purpose |
|------|---------|
| `manifests/systemd/stirling-pdf.service` | systemd unit file |
| `manifests/systemd/stirling-pdf.conf` | Environment / config file |
| `manifests/systemd/install-service.sh` | Standalone installer script |

**Standalone install:**

```bash
sudo ./manifests/systemd/install-service.sh /path/to/Stirling-PDF.jar
```

After install: <http://localhost:8080>

---

## Windows Service (WinSW)

**Files:**

| File | Purpose |
|------|---------|
| `manifests/windows-service/stirling-pdf-service.xml` | WinSW config |
| `manifests/windows-service/install-service.ps1` | PowerShell installer |
| `manifests/windows-service/README.md` | Detailed instructions |

**Quick install (PowerShell as Administrator):**

```powershell
.\manifests\windows-service\install-service.ps1 -JarPath .\Stirling-PDF.jar
```

Full instructions: [manifests/windows-service/README.md](../../manifests/windows-service/README.md)

---

## Release checklist

When publishing a new release:

- [ ] GitHub Actions publishes `.deb` to APT repo automatically
- [ ] GitHub Actions publishes `.rpm` to COPR automatically
- [ ] Update `version` + sha256 hashes in `manifests/nix/flake.nix`
- [ ] Attach `stirling-pdf-service.xml` and `install-service.ps1` to release assets (Windows)
- [ ] Attach `install-service.sh` to release assets (Linux standalone)
