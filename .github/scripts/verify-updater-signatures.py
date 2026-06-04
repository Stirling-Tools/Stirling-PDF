#!/usr/bin/env python3
"""Verify Tauri updater signatures against the app's configured public key.

Every signed updater payload (.deb/.rpm/.AppImage/.msi/.app.tar.gz) ships with a
sibling <artifact>.sig - a base64-wrapped minisign signature. This checks each one
cryptographically with the SAME Ed25519 public key embedded in the app
(plugins.updater.pubkey in tauri.conf.json), i.e. exactly what the updater client
does at runtime before installing. Exits non-zero if any signature fails so a bad
or mismatched signature can never reach a release.

Usage: verify-updater-signatures.py <dir-to-scan> [tauri.conf.json]
"""

import sys
import json
import base64
import hashlib
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature

ART_ROOT = Path(sys.argv[1])
CONF = Path(
    sys.argv[2] if len(sys.argv) > 2 else "frontend/editor/src-tauri/tauri.conf.json"
)


def load_pubkey():
    raw = json.loads(CONF.read_text())["plugins"]["updater"]["pubkey"]
    # tauri pubkey = base64 of a minisign .pub file; its last line is base64 of
    # [2 algo][8 key-id][32 ed25519 public key].
    blob = base64.b64decode(base64.b64decode(raw).decode().splitlines()[-1])
    return blob[2:10], Ed25519PublicKey.from_public_bytes(blob[10:])


def verify(artifact: Path, sig_file: Path, keyid_pub, pub) -> str:
    # tauri .sig = base64 of a minisign signature file.
    lines = base64.b64decode(sig_file.read_text()).decode().splitlines()
    sig_blob = base64.b64decode(lines[1])  # [2 algo][8 key-id][64 sig]
    algo, keyid, sig = sig_blob[:2], sig_blob[2:10], sig_blob[10:74]
    if keyid != keyid_pub:
        return f"FAIL key-id mismatch (sig {keyid.hex()} vs pub {keyid_pub.hex()})"
    data = artifact.read_bytes()
    # 'ED' = prehashed (BLAKE2b-512), 'Ed' = legacy (raw message).
    msg = hashlib.blake2b(data, digest_size=64).digest() if algo == b"ED" else data
    try:
        pub.verify(sig, msg)
    except InvalidSignature:
        return f"FAIL signature invalid (algo={algo.decode()})"
    # The global signature covers the signature + trusted comment.
    tc = lines[2].split("trusted comment: ", 1)[1] if len(lines) > 2 else ""
    try:
        pub.verify(base64.b64decode(lines[3]), sig + tc.encode())
        gc = "global-sig OK"
    except (InvalidSignature, IndexError):
        gc = "global-sig FAIL"
    return f"VALID (algo={algo.decode()}, keyid={keyid.hex()}, {gc})"


keyid_pub, pub = load_pubkey()
print(f"updater pubkey keyid={keyid_pub.hex()}\n")
sigs = sorted(ART_ROOT.rglob("*.sig"))
if not sigs:
    print(f"WARN: no .sig files under {ART_ROOT} - nothing to verify")
    sys.exit(0)
bad = 0
for sig_file in sigs:
    artifact = sig_file.with_suffix("")  # strip .sig
    if not artifact.exists():
        print(f"  ? {sig_file.name}: artifact missing")
        bad += 1
        continue
    res = verify(artifact, sig_file, keyid_pub, pub)
    print(f"  {artifact.name}: {res}")
    if not res.startswith("VALID") or "global-sig FAIL" in res:
        bad += 1
print(f"\n{'ALL SIGNATURES VALID' if bad == 0 else f'{bad} SIGNATURE(S) FAILED'}")
sys.exit(1 if bad else 0)
