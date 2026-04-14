from __future__ import annotations

from collections.abc import Iterator

import pytest

from stirling.config import AppSettings, load_settings
from stirling.services import build_runtime
from stirling.services.runtime import AppRuntime


@pytest.fixture(autouse=True)
def clear_settings_cache() -> Iterator[None]:
    load_settings.cache_clear()
    yield
    load_settings.cache_clear()


def build_app_settings() -> AppSettings:
    return AppSettings(
        smart_model_name="test",
        fast_model_name="test",
        smart_model_max_tokens=8192,
        fast_model_max_tokens=2048,
        posthog_enabled=False,
        posthog_api_key="",
        posthog_host="https://eu.i.posthog.com",
    )


@pytest.fixture
def app_settings() -> AppSettings:
    return build_app_settings()


@pytest.fixture
def runtime(app_settings: AppSettings) -> AppRuntime:
    return build_runtime(app_settings)
