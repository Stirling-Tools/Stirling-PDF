#!/usr/bin/env python3
"""Download the pinned gitleaks binary into .task/bin, verifying its checksum.

gitleaks is a Go binary with no PyPI package, so it can't be locked like the
other tools (ruff/codespell/toml-sort live in scripts/pre-commit/pyproject.toml).
This script is the single source of truth for the gitleaks version and the
SHA-256 of each release asset. It is cross-platform (stdlib only) and idempotent:
if the cached binary already reports the pinned version it does nothing, so
`task pre-commit` can call it every run.

Bump the version by editing VERSION and the SHA256 map (values come from the
release's gitleaks_<version>_checksums.txt).
"""

from __future__ import annotations

import hashlib
import platform
import subprocess
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

VERSION = "8.30.0"

# SHA-256 of each release asset, keyed by "<os>_<arch>" (gitleaks' own naming).
SHA256 = {
    "linux_x64": "79a3ab579b53f71efd634f3aaf7e04a0fa0cf206b7ed434638d1547a2470a66e",
    "linux_arm64": "b4cbbb6ddf7d1b2a603088cd03a4e3f7ce48ee7fd449b51f7de6ee2906f5fa2f",
    "darwin_x64": "ca221d012d247080c2f6f61f4b7a83bffa2453806b0c195c795bbe9a8c775ed5",
    "darwin_arm64": "b251ab2bcd4cd8ba9e56ff37698c033ebf38582b477d21ebd86586d927cf87e7",
    "windows_x64": "54fe94f644b832dd08e8c3a5915efb3bfa862386d59fb27ca0792cb687a83573",
}

REPO_ROOT = Path(__file__).resolve().parents[2]
IS_WINDOWS = platform.system() == "Windows"
BIN = REPO_ROOT / ".task" / "bin" / ("gitleaks.exe" if IS_WINDOWS else "gitleaks")


def platform_key() -> str:
    os_name = {"Linux": "linux", "Darwin": "darwin", "Windows": "windows"}.get(
        platform.system()
    )
    arch = {
        "x86_64": "x64",
        "amd64": "x64",
        "arm64": "arm64",
        "aarch64": "arm64",
        "i386": "x32",
        "i686": "x32",
        "x86": "x32",
        "armv7l": "armv7",
        "armv6l": "armv6",
    }.get(platform.machine().lower())
    if not os_name or not arch:
        raise SystemExit(
            f"Unsupported platform for gitleaks: {platform.system()}/{platform.machine()}"
        )
    return f"{os_name}_{arch}"


def cached_version() -> str | None:
    if not BIN.exists():
        return None
    try:
        return subprocess.run(
            [str(BIN), "version"], capture_output=True, text=True
        ).stdout.strip()
    except OSError:
        return None


def main() -> int:
    if cached_version() == VERSION:
        return 0

    key = platform_key()
    expected = SHA256.get(key)
    if expected is None:
        raise SystemExit(f"No pinned gitleaks checksum for {key}")

    suffix = "zip" if key.startswith("windows") else "tar.gz"
    asset = f"gitleaks_{VERSION}_{key}.{suffix}"
    url = f"https://github.com/gitleaks/gitleaks/releases/download/v{VERSION}/{asset}"
    print(f"Downloading gitleaks {VERSION} ({asset})", flush=True)

    BIN.parent.mkdir(parents=True, exist_ok=True)
    archive, _ = urllib.request.urlretrieve(url)
    digest = hashlib.sha256(Path(archive).read_bytes()).hexdigest()
    if digest != expected:
        raise SystemExit(
            f"gitleaks checksum mismatch: expected {expected}, got {digest}"
        )

    member = "gitleaks.exe" if IS_WINDOWS else "gitleaks"
    if suffix == "zip":
        with zipfile.ZipFile(archive) as zf:
            data = zf.read(member)
    else:
        with tarfile.open(archive) as tf:
            extracted = tf.extractfile(member)
            if extracted is None:
                raise SystemExit(f"{member} not found in {asset}")
            data = extracted.read()
    BIN.write_bytes(data)
    BIN.chmod(0o755)
    return 0


if __name__ == "__main__":
    sys.exit(main())
