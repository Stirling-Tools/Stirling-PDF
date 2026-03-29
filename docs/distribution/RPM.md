# RPM / COPR Repository — Setup & Usage Guide

## For users: installing Stirling-PDF via DNF (Fedora / RHEL / CentOS)

```bash
# Enable the COPR repository
sudo dnf copr enable @stirling-tools/stirling-pdf

# Install
sudo dnf install stirling-pdf
```

The package installs the server JAR along with a systemd service file. After
installation:

```bash
sudo systemctl enable --now stirling-pdf
# Then open http://localhost:8080
```

---

## For the maintainer: one-time setup

### Step 1 — Create a Fedora Account (FAS)

1. Go to <https://accounts.fedoraproject.org/> and create an account.
2. Note your FAS username (e.g. `stirling-tools`).

### Step 2 — Create a COPR project

1. Log in to <https://copr.fedorainfracloud.org/>.
2. Click **New Project**.
3. Fill in:
   - **Project name**: `stirling-pdf`
   - **Chroots**: select `fedora-40-x86_64`, `fedora-41-x86_64`,
     `epel-9-x86_64`, `epel-10-x86_64` (add more as needed).
   - **Description**: Locally hosted web-based PDF manipulation tool.
   - **Homepage**: <https://www.stirlingpdf.com>
4. Under **Settings → Permissions**, optionally add co-maintainers.

### Step 3 — Generate a COPR API token

1. Go to <https://copr.fedorainfracloud.org/api/>.
2. Note the **login**, **username**, and **token** fields.

### Step 4 — Add GitHub Secrets / Variables

Go to **Settings → Secrets and variables → Actions** and add:

| Type | Name | Value |
|------|------|-------|
| Secret | `COPR_API_TOKEN` | Token from COPR API page |
| Variable | `COPR_LOGIN` | `login` value from COPR API page |
| Variable | `COPR_USERNAME` | Your FAS username |
| Variable | `COPR_PROJECT_NAME` | `stirling-pdf` |

### Step 5 — First run

Publish a release or trigger the workflow manually:
**Actions → Publish to COPR (RPM) → Run workflow**.

---

## RPM Spec file

The spec file at `manifests/rpm/stirling-pdf.spec` is provided as a reference
for rebuilding / submitting to downstream distributors (Fedora, EPEL, openSUSE
Build Service, etc.).

Build locally with:

```bash
# Install build tools
sudo dnf install rpm-build java-17-openjdk-headless

# Build (replace VERSION)
rpmbuild -ba manifests/rpm/stirling-pdf.spec \
  --define "version 1.0.0"
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `copr-cli` authentication error | Verify `~/.config/copr` credentials |
| Build fails in COPR | Check the chroot build log in the COPR web UI |
| Package not found after enable | Run `sudo dnf makecache` |
