"""Tests for the encrypted config cache (stirling.config.config_cache)."""

from __future__ import annotations

import os
import stat
from pathlib import Path

import pytest

from stirling.config import config_cache
from stirling.contracts import ConfigPushRequest


def _sample() -> ConfigPushRequest:
    return ConfigPushRequest.model_validate(
        {
            "models": {
                "provider": "anthropic",
                "smartModel": "claude-haiku-4-5",
                "fastModel": "claude-haiku-4-5",
                "smartMaxTokens": 8192,
                "fastMaxTokens": 2048,
                "apiKey": "secret-key-value",
                "baseUrl": "",
            },
            "rag": {
                "embeddingProvider": "voyageai",
                "embeddingModel": "voyage-4",
                "embeddingApiKey": "embed-secret",
                "embeddingBaseUrl": "",
                "topK": 20,
                "maxSearches": 5,
            },
            "limits": {"maxPages": 200, "maxCharacters": 200000, "modelMaxConcurrency": 32},
        }
    )


def test_roundtrip_with_shared_secret(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(config_cache, "_shared_secret", lambda: "the-shared-secret")
    req = _sample()
    config_cache.save_config(req, data_dir=tmp_path)
    # HKDF-from-secret path: no keyfile is written.
    assert not (tmp_path / "ai_config_cache.key").exists()
    assert config_cache.load_config(data_dir=tmp_path) == req
    # Secrets are encrypted at rest.
    assert b"secret-key-value" not in (tmp_path / "ai_config_cache.enc").read_bytes()


def test_roundtrip_with_keyfile_when_no_secret(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(config_cache, "_shared_secret", lambda: "")
    req = _sample()
    config_cache.save_config(req, data_dir=tmp_path)
    # No shared secret: a random keyfile is generated and reused for decrypt.
    assert (tmp_path / "ai_config_cache.key").exists()
    assert config_cache.load_config(data_dir=tmp_path) == req


def test_load_missing_returns_none(tmp_path: Path) -> None:
    assert config_cache.load_config(data_dir=tmp_path) is None


def test_load_corrupt_returns_none(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(config_cache, "_shared_secret", lambda: "a-secret")
    (tmp_path / "ai_config_cache.enc").write_bytes(b"not-a-valid-fernet-token")
    assert config_cache.load_config(data_dir=tmp_path) is None


def test_wrong_key_returns_none(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(config_cache, "_shared_secret", lambda: "secret-a")
    config_cache.save_config(_sample(), data_dir=tmp_path)
    # A different secret derives a different key -> decrypt fails, returns None.
    monkeypatch.setattr(config_cache, "_shared_secret", lambda: "secret-b")
    assert config_cache.load_config(data_dir=tmp_path) is None


@pytest.mark.skipif(os.name == "nt", reason="POSIX file modes are not enforced on Windows")
def test_cache_and_keyfile_are_owner_only(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Both files hold credential material, so neither may land at the umask default."""
    monkeypatch.setattr(config_cache, "_shared_secret", lambda: "")
    config_cache.save_config(_sample(), data_dir=tmp_path)

    for name in ("ai_config_cache.enc", "ai_config_cache.key"):
        mode = stat.S_IMODE((tmp_path / name).stat().st_mode)
        assert mode == 0o600, f"{name} is {oct(mode)}, expected 0o600"


def test_save_leaves_no_temp_file_behind(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """The write goes via a temp file + rename so a reader never sees a partial cache."""
    monkeypatch.setattr(config_cache, "_shared_secret", lambda: "the-shared-secret")
    config_cache.save_config(_sample(), data_dir=tmp_path)
    config_cache.save_config(_sample(), data_dir=tmp_path)

    assert not list(tmp_path.glob("*.tmp"))
    assert config_cache.load_config(data_dir=tmp_path) == _sample()


def test_cache_stamp_tracks_writes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """cache_stamp is None before any write and changes when the file is rewritten."""
    monkeypatch.setattr(config_cache, "_shared_secret", lambda: "the-shared-secret")
    assert config_cache.cache_stamp(data_dir=tmp_path) is None

    config_cache.save_config(_sample(), data_dir=tmp_path)
    first = config_cache.cache_stamp(data_dir=tmp_path)
    assert first is not None

    bigger = _sample()
    bigger.models.smart_model = "claude-haiku-4-5-with-a-much-longer-name-so-the-size-differs"
    config_cache.save_config(bigger, data_dir=tmp_path)
    assert config_cache.cache_stamp(data_dir=tmp_path) != first
