"""Persistent, encrypted cache of the last-applied config-push.

The engine otherwise holds pushed config in RAM only, so a restart reverts to the
env values until the processor pushes again. We persist the last-applied
:class:`ConfigPushRequest` to ``<engine data dir>/ai_config_cache.enc`` (Fernet
encrypted) and reload it on boot so the effective config survives restarts.

Key derivation: when ``STIRLING_ENGINE_SHARED_SECRET`` is set, the Fernet key is
HKDF-SHA256 over that secret (constant salt/info) so no key material touches disk.
Otherwise a random Fernet key is generated once and stored in a sibling
``ai_config_cache.key`` (0600, best-effort) with a one-time warning.
"""

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


def _chmod_600(path: Path) -> None:
    # Best-effort owner-only perms; silently ignored where unsupported (e.g. Windows).
    try:
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass


def _load_or_create_keyfile(data_dir: Path) -> bytes:
    global _keyfile_warned
    key_path = data_dir / _KEY_FILENAME
    if key_path.exists():
        return key_path.read_bytes().strip()
    key = Fernet.generate_key()
    data_dir.mkdir(parents=True, exist_ok=True)
    key_path.write_bytes(key)
    _chmod_600(key_path)
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
    (data_dir / _CACHE_FILENAME).write_bytes(token)


def load_config(*, data_dir: Path | None = None) -> ConfigPushRequest | None:
    """Load + decrypt the persisted pushed config.

    Returns None (never raises) when the cache is absent, corrupt, or was written
    under a different key, so a bad cache can never crash boot.
    """
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
