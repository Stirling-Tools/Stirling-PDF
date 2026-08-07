#!/usr/bin/env python3
"""Verify Tauri updater .sig files against plugins.updater.pubkey in tauri.conf.json.

Usage: verify-updater-signatures.py <dir-to-scan> [tauri.conf.json]
"""

import binascii
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
    # tauri pubkey = base64 of a minisign .pub file; last line is base64 of
    # [2 algo][8 key-id][32 ed25519 public key].
    raw = json.loads(CONF.read_text())["plugins"]["updater"]["pubkey"]
    blob = base64.b64decode(base64.b64decode(raw).decode().splitlines()[-1])
    return blob[2:10], Ed25519PublicKey.from_public_bytes(blob[10:])


def hash_file(path: Path) -> bytes:
    h = hashlib.blake2b(digest_size=64)
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.digest()


def verify(artifact: Path, sig_file: Path, keyid_pub, pub) -> str:
    # tauri .sig = base64 of a minisign signature file (4 lines).
    try:
        lines = base64.b64decode(sig_file.read_text()).decode().splitlines()
        sig_blob = base64.b64decode(lines[1])
    except (binascii.Error, IndexError, UnicodeDecodeError) as e:
        return f"FAIL malformed sig ({type(e).__name__})"
    algo, keyid, sig = sig_blob[:2], sig_blob[2:10], sig_blob[10:74]
    if keyid != keyid_pub:
        return f"FAIL key-id mismatch (sig {keyid.hex()} vs pub {keyid_pub.hex()})"
    # 'ED' = prehashed (BLAKE2b-512), 'Ed' = legacy (raw message).
    msg = hash_file(artifact) if algo == b"ED" else artifact.read_bytes()
    try:
        pub.verify(sig, msg)
    except InvalidSignature:
        return f"FAIL signature invalid (algo={algo.decode()})"
    # Global signature covers sig + trusted_comment.
    gc = "global-sig FAIL"
    try:
        tc = lines[2].split("trusted comment: ", 1)[1]
        pub.verify(base64.b64decode(lines[3]), sig + tc.encode())
        gc = "global-sig OK"
    except (InvalidSignature, IndexError, binascii.Error):
        pass
    return f"VALID (algo={algo.decode()}, keyid={keyid.hex()}, {gc})"


keyid_pub, pub = load_pubkey()
print(f"updater pubkey keyid={keyid_pub.hex()}\n")
sigs = sorted(ART_ROOT.rglob("*.sig"))
if not sigs:
    print(f"WARN: no .sig files under {ART_ROOT} - nothing to verify")
    sys.exit(0)
bad = 0
for sig_file in sigs:
    artifact = sig_file.with_suffix("")
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
