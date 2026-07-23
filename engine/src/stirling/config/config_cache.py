"""Persistent, Fernet-encrypted cache of the last-applied config-push. Boot restores it so an
engine-only restart keeps admin config; sibling uvicorn workers poll it to adopt a push."""

from __future__ import annotations

import base64
import logging
import os
import stat
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from stirling.config.settings import ENGINE_ROOT, load_settings
from stirling.contracts import ConfigPushRequest

logger = logging.getLogger(__name__)

_CACHE_FILENAME = "ai_config_cache.enc"
_KEY_FILENAME = "ai_config_cache.key"
# Constant salt/info so the same shared secret always derives the same Fernet key.
_HKDF_SALT = b"stirling-ai-config-cache/v1/salt"
_HKDF_INFO = b"stirling-ai-config-cache/v1/fernet-key"

_keyfile_warned = False


def _default_data_dir() -> Path:
    """The engine data dir (where the sqlite store lives by default)."""
    return ENGINE_ROOT / "data"


def _shared_secret() -> str:
    return load_settings().engine_shared_secret


def _derive_key_from_secret(secret: str) -> bytes:
    hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=_HKDF_SALT, info=_HKDF_INFO)
    return base64.urlsafe_b64encode(hkdf.derive(secret.encode("utf-8")))


def _write_private_bytes(path: Path, payload: bytes) -> None:
    """Write ``payload`` to ``path`` atomically (temp file + rename) and owner-only (0600) from the moment it exists."""
    tmp_path = path.with_name(f"{path.name}.tmp")
    fd = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, stat.S_IRUSR | stat.S_IWUSR)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise


def _load_or_create_keyfile(data_dir: Path) -> bytes:
    global _keyfile_warned
    key_path = data_dir / _KEY_FILENAME
    if key_path.exists():
        return key_path.read_bytes().strip()
    key = Fernet.generate_key()
    data_dir.mkdir(parents=True, exist_ok=True)
    _write_private_bytes(key_path, key)
    if not _keyfile_warned:
        logger.warning(
            "STIRLING_ENGINE_SHARED_SECRET is not set; encrypting the AI config cache with a local"
            " keyfile at %s (0600, best-effort). This is modest protection only - set a shared secret"
            " for HKDF key derivation in any deployment where the cache must be strongly protected.",
            key_path,
        )
        _keyfile_warned = True
    return key


def _fernet(data_dir: Path) -> Fernet:
    secret = _shared_secret()
    if secret:
        return Fernet(_derive_key_from_secret(secret))
    return Fernet(_load_or_create_keyfile(data_dir))


def save_config(request: ConfigPushRequest, *, data_dir: Path | None = None) -> None:
    """Encrypt and persist the last-applied pushed config, overwriting any prior file."""
    data_dir = data_dir or _default_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    payload = request.model_dump_json(by_alias=True).encode("utf-8")
    token = _fernet(data_dir).encrypt(payload)
    _write_private_bytes(data_dir / _CACHE_FILENAME, token)


def cache_stamp(*, data_dir: Path | None = None) -> tuple[int, int] | None:
    """Identify the current cache file as (mtime_ns, size), or None when absent; cheap enough to poll."""
    cache_path = (data_dir or _default_data_dir()) / _CACHE_FILENAME
    try:
        info = cache_path.stat()
    except OSError:
        return None
    return (info.st_mtime_ns, info.st_size)


def load_config(*, data_dir: Path | None = None) -> ConfigPushRequest | None:
    """Load + decrypt the persisted config; returns None (never raises) when absent, corrupt, or wrong key."""
    data_dir = data_dir or _default_data_dir()
    cache_path = data_dir / _CACHE_FILENAME
    if not cache_path.exists():
        return None
    try:
        token = cache_path.read_bytes()
        payload = _fernet(data_dir).decrypt(token)
        return ConfigPushRequest.model_validate_json(payload)
    except (InvalidToken, ValueError, OSError) as exc:
        logger.warning("Ignoring unreadable AI config cache at %s: %s", cache_path, exc)
        return None
