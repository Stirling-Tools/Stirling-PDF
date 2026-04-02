"""
Per-session AI debug logging.

When STIRLING_AI_LOG_LEVEL=trace, each AI session gets its own log file
under ``logs/ai_sessions/`` containing the full request/response payloads
in chronological order.

Usage::

    from ai_logging import SessionLogger

    slog = SessionLogger(session_id="abc-123")
    slog.request("examine", url=url, body=payload)
    slog.response("examine", status=200, body=response)
    slog.tool_call("scan_arithmetic", args={...}, result=[...])
    slog.close()

At ``info`` or ``debug`` level the class is a no-op — ``SessionLogger``
checks the level once at construction time and short-circuits every call.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_logger = logging.getLogger(__name__)

# Populated by config.py at import time
_ai_log_level: str = "info"
_log_path: Path = Path("./logs")


def configure(ai_log_level: str, log_path: Path) -> None:
    """Called once from config.py to inject runtime settings."""
    global _ai_log_level, _log_path  # noqa: PLW0603
    _ai_log_level = ai_log_level
    _log_path = log_path


def _pretty(obj: Any) -> str:
    """Best-effort JSON pretty-print, falls back to repr."""
    if obj is None:
        return "<none>"
    if isinstance(obj, str):
        try:
            obj = json.loads(obj)
        except (json.JSONDecodeError, TypeError):
            return obj
    try:
        return json.dumps(obj, indent=2, default=str, ensure_ascii=False)
    except TypeError:
        return repr(obj)


class SessionLogger:
    """Writes structured entries to a per-session log file when in trace mode."""

    def __init__(self, session_id: str) -> None:
        self._enabled = _ai_log_level == "trace"
        self._session_id = session_id
        self._fh: Any | None = None
        self._entry = 0

        if not self._enabled:
            return

        sessions_dir = _log_path / "ai_sessions"
        sessions_dir.mkdir(parents=True, exist_ok=True)

        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
        prefix = session_id[:8] if len(session_id) >= 8 else session_id
        filename = f"{ts}_{prefix}.log"
        filepath = sessions_dir / filename

        self._fh = open(filepath, "w", encoding="utf-8")  # noqa: SIM115
        self._write_header()
        _logger.info("AI session log: %s", filepath)

    def _write_header(self) -> None:
        if not self._fh:
            return
        self._fh.write(f"Session: {self._session_id}\n")
        self._fh.write(f"Started: {datetime.now(timezone.utc).isoformat()}\n")
        self._fh.write("=" * 80 + "\n\n")
        self._fh.flush()

    def _next_entry(self, label: str) -> None:
        if not self._fh:
            return
        self._entry += 1
        self._fh.write(f"--- [{self._entry}] {label} ---\n")

    def request(self, phase: str, *, url: str = "", body: Any = None) -> None:
        """Log an outbound HTTP request to the LLM provider."""
        if not self._enabled:
            return
        self._next_entry(f"REQUEST ({phase})")
        if url:
            self._fh.write(f"URL: {url}\n")
        self._fh.write(f"Body:\n{_pretty(body)}\n\n")
        self._fh.flush()

    def response(self, phase: str, *, status: int = 0, body: Any = None) -> None:
        """Log an inbound HTTP response from the LLM provider."""
        if not self._enabled:
            return
        self._next_entry(f"RESPONSE ({phase})")
        if status:
            self._fh.write(f"Status: {status}\n")
        self._fh.write(f"Body:\n{_pretty(body)}\n\n")
        self._fh.flush()

    def tool_call(self, tool_name: str, *, args: Any = None, result: Any = None) -> None:
        """Log a tool invocation and its result."""
        if not self._enabled:
            return
        self._next_entry(f"TOOL ({tool_name})")
        self._fh.write(f"Args:\n{_pretty(args)}\n")
        self._fh.write(f"Result:\n{_pretty(result)}\n\n")
        self._fh.flush()

    def message(self, text: str) -> None:
        """Log a freeform message."""
        if not self._enabled:
            return
        self._next_entry("MESSAGE")
        self._fh.write(f"{text}\n\n")
        self._fh.flush()

    def close(self) -> None:
        """Flush and close the session log file."""
        if self._fh:
            self._fh.write("=" * 80 + "\n")
            self._fh.write(f"Ended: {datetime.now(timezone.utc).isoformat()}\n")
            self._fh.close()
            self._fh = None
