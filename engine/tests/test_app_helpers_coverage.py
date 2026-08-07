from __future__ import annotations

import asyncio
import importlib
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from conftest import build_app_settings

from stirling.config import AppSettings

app_module = importlib.import_module("stirling.api.app")

# The watcher test temporarily swaps a module-level callback.
# pyright: reportAttributeAccessIssue=false


@pytest.mark.anyio
async def test_reaper_and_sleep_helpers_handle_stop_timeout_and_errors() -> None:
    stop = asyncio.Event()
    assert await app_module._sleep_until(stop, 0.001) is False
    stop.set()
    assert await app_module._sleep_until(stop, 1) is True

    documents = SimpleNamespace(reap_expired=AsyncMock(return_value=1))
    await app_module._reap(documents)
    documents.reap_expired.side_effect = RuntimeError("temporary")
    await app_module._reap(documents)
    documents.reap_expired.side_effect = asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError):
        await app_module._reap(documents)

    documents.reap_expired.side_effect = None
    documents.reap_expired.return_value = 0
    stop.clear()
    stop.set()
    await app_module._run_expired_doc_reaper(documents, 1, stop)


def test_startup_settings_and_cached_config_fallbacks(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = build_app_settings()
    fast_api = SimpleNamespace(dependency_overrides={app_module.load_settings: lambda: settings})
    assert app_module._load_startup_settings(fast_api) is settings
    monkeypatch.setattr(app_module, "load_config", lambda: None)
    assert app_module._restore_cached_config(settings)[0] is settings
    monkeypatch.setattr(app_module, "load_config", lambda: object())
    monkeypatch.setattr(app_module, "resolve_and_apply", lambda *_args: (_ for _ in ()).throw(ValueError("bad")))
    assert app_module._restore_cached_config(settings)[0] is settings


def test_cached_config_adoption_ignores_missing_and_bad_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    state = SimpleNamespace(config_cache_stamp=None)
    fast_api = SimpleNamespace(state=state)
    monkeypatch.setattr(app_module, "cache_stamp", lambda: None)
    app_module._adopt_cached_config_if_changed(fast_api)
    monkeypatch.setattr(app_module, "cache_stamp", lambda: "stamp")
    monkeypatch.setattr(app_module, "load_config", lambda: None)
    app_module._adopt_cached_config_if_changed(fast_api)
    assert state.config_cache_stamp == "stamp"

    monkeypatch.setattr(app_module, "load_config", lambda: object())
    monkeypatch.setattr(app_module, "apply_to_app", lambda *_args: (_ for _ in ()).throw(ValueError("bad")))
    state.config_cache_stamp = None
    app_module._adopt_cached_config_if_changed(fast_api)


def test_startup_settings_uses_default_loader(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = build_app_settings()
    fast_api = SimpleNamespace(dependency_overrides={})
    monkeypatch.setattr(app_module, "load_settings", lambda: settings)
    assert app_module._load_startup_settings(fast_api) is settings


@pytest.mark.anyio
async def test_config_watcher_continues_after_iteration_error() -> None:
    stop = asyncio.Event()
    calls = 0

    def adopt(_api: object) -> None:
        nonlocal calls
        calls += 1
        stop.set()
        raise RuntimeError("temporary")

    original = app_module._adopt_cached_config_if_changed
    app_module._adopt_cached_config_if_changed = adopt
    try:
        await app_module._run_config_cache_watcher(SimpleNamespace(), 0.001, stop)
    finally:
        app_module._adopt_cached_config_if_changed = original
    assert calls == 1


@pytest.mark.anyio
async def test_healthcheck_uses_live_settings(app_settings: AppSettings) -> None:
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=app_settings)))
    result = await app_module.healthcheck(request)
    assert result.status == "ok"
    assert result.smart_model == app_settings.smart_model_name
