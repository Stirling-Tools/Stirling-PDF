"""The root-level ASGI shim serves the same app as ``stirling.api.app``."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from stirling.api.app import app

_SHIM = Path(__file__).resolve().parents[1] / "asgi.py"


def test_shim_exposes_the_engine_app() -> None:
    spec = importlib.util.spec_from_file_location("asgi", _SHIM)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    assert module.app is app
