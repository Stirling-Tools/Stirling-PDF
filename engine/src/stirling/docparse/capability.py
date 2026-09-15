"""Probe whether the docparse addon (Docling) is importable and its models present.

The addon arrives either baked into the engine image (uv extra) or dynamically
installed into ``$STIRLING_DOCPARSE_HOME/site`` on a mounted volume; in the
latter case :func:`activate_site` prepends that directory to ``sys.path`` at
startup so the probe and the parser see it.
"""

from __future__ import annotations

import importlib
import importlib.metadata
import importlib.util
import logging
import sys
import threading
from pathlib import Path

from stirling.contracts.docparse import DocparseCapabilities

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_cached: DocparseCapabilities | None = None


def site_dir(docparse_home: str) -> Path | None:
    return Path(docparse_home) / "site" if docparse_home else None


def models_dir(docparse_home: str) -> Path | None:
    return Path(docparse_home) / "models" if docparse_home else None


def activate_site(docparse_home: str) -> bool:
    """Prepend the dynamic-install site dir to ``sys.path`` if it exists.

    Idempotent; returns True when the path is active. Called once from the app
    lifespan before the first capability probe.
    """
    site = site_dir(docparse_home)
    if site is None or not site.is_dir():
        return False
    site_str = str(site)
    if site_str not in sys.path:
        sys.path.insert(0, site_str)
        logger.info("docparse: activated dynamic site dir %s", site_str)
    return True


def _version_of(distribution: str) -> str | None:
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        return None


def _models_available(docparse_home: str) -> tuple[bool, str | None]:
    """Models count as available when the prefetch dir has content, or when no
    home is configured at all (Docling then downloads into its default cache)."""
    directory = models_dir(docparse_home)
    if directory is None:
        return True, None
    if directory.is_dir() and any(directory.iterdir()):
        return True, str(directory)
    return False, str(directory)


def probe_capabilities(docparse_home: str, *, refresh: bool = False) -> DocparseCapabilities:
    """Report what the docparse layer can do right now. Cached after first call
    (imports are expensive); ``refresh=True`` re-probes, e.g. after a dynamic install."""
    global _cached
    with _lock:
        if _cached is not None and not refresh:
            return _cached

        errors: list[str] = []
        advanced = importlib.util.find_spec("docling") is not None
        docling_version: str | None = None
        torch_version: str | None = None
        if advanced:
            docling_version = _version_of("docling")
            torch_version = _version_of("torch")
            if torch_version is None:
                advanced = False
                errors.append("docling present but torch missing; install is incomplete")
        models_ok, models_path = _models_available(docparse_home)

        _cached = DocparseCapabilities(
            advanced_installed=advanced,
            docling_version=docling_version,
            torch_version=torch_version,
            models_available=models_ok,
            models_path=models_path,
            errors=errors,
        )
        logger.info(
            "docparse capabilities: advanced=%s docling=%s torch=%s models=%s",
            advanced,
            docling_version,
            torch_version,
            models_ok,
        )
        return _cached
