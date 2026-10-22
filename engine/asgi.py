"""ASGI entrypoint for hosts that import the app from the engine root rather than from ``src/``, such as Vercel."""

import sys
from pathlib import Path

# The ``stirling`` package lives under src/ and is never installed: the hatch wheel
# would ship it as ``src.stirling``, which breaks its own absolute imports.
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from stirling.api.app import app

__all__ = ["app"]
