from __future__ import annotations

import os

from pytest import Config


def pytest_configure(config: Config) -> None:
    # Set required env vars in case there is no .env file
    os.environ.setdefault("STIRLING_OPENAI_API_KEY", "test")
    os.environ.setdefault("STIRLING_POSTHOG_API_KEY", "test")
