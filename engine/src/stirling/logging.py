"""Shared logging utilities for the Stirling AI engine."""

from __future__ import annotations

import json
import logging
from collections.abc import Generator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from stirling.config.settings import ENGINE_ROOT

SESSIONS_DIR = ENGINE_ROOT / "logs" / "ai_sessions"


class Pretty:
    """Lazy JSON formatter — only serialises when ``str()`` is called.

    Designed for use with ``logging``'s ``%s`` formatting so that the
    JSON serialisation is skipped entirely when the log message is
    never emitted.
    """

    __slots__ = ("_obj",)

    def __init__(self, obj: object) -> None:
        self._obj = obj

    def __str__(self) -> str:
        return json.dumps(self._obj, indent=2, default=str, ensure_ascii=True)


def trace_logger(name: str) -> logging.Logger:
    """Create an isolated trace logger that only writes to explicitly added handlers."""
    lg = logging.getLogger(f"{name}.trace")
    lg.propagate = False
    return lg


@contextmanager
def session_trace(
    logger: logging.Logger,
    session_id: str,
    *,
    enabled: bool,
    log_dir: Path = SESSIONS_DIR,
) -> Generator[None]:
    """Attach a per-session file handler to *logger* for the duration of the block."""
    if not enabled:
        yield
        return
    log_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(UTC).strftime("%Y-%m-%d_%H-%M-%S")
    prefix = session_id[:8] if len(session_id) >= 8 else session_id
    fh = logging.FileHandler(log_dir / f"{ts}_{prefix}.log", encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    fh.setLevel(logging.DEBUG)
    logger.setLevel(logging.DEBUG)
    logger.addHandler(fh)
    logger.debug("Session: %s\n%s", session_id, "=" * 80)
    try:
        yield
    finally:
        logger.debug("%s\nSession ended: %s", "=" * 80, session_id)
        logger.removeHandler(fh)
        fh.close()
        logger.setLevel(logging.NOTSET)
