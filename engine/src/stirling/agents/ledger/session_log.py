"""
Per-session AI debug logging for the Math Auditor Agent.

When ``ai_log_level`` is set to ``trace``, each audit session gets its own
log file under ``logs/ai_sessions/`` containing the full request/response
payloads in chronological order.

At ``info`` or ``debug`` level the class is a no-op — ``SessionLogger``
checks the level once at construction time and short-circuits every call.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Self, TextIO

_logger = logging.getLogger(__name__)


def _pretty(obj: object) -> str:
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

    def __init__(
        self,
        session_id: str,
        *,
        ai_log_level: str = "info",
        log_path: Path | None = None,
    ) -> None:
        self._enabled = ai_log_level.lower().strip() == "trace"
        self._session_id = session_id
        self._fh: TextIO | None = None
        self._entry = 0
        self._start = datetime.now(UTC)

        if not self._enabled:
            return

        sessions_dir = (log_path or Path("./logs")) / "ai_sessions"
        sessions_dir.mkdir(parents=True, exist_ok=True)

        ts = datetime.now(UTC).strftime("%Y-%m-%d_%H-%M-%S")
        prefix = session_id[:8] if len(session_id) >= 8 else session_id
        filename = f"{ts}_{prefix}.log"
        filepath = sessions_dir / filename

        self._fh = open(filepath, "w", encoding="utf-8")
        self._write_header()
        _logger.info("AI session log: %s", filepath)

    def _write_header(self) -> None:
        if not self._fh:
            return
        self._fh.write(f"Session: {self._session_id}\n")
        self._fh.write(f"Started: {datetime.now(UTC).isoformat()}\n")
        self._fh.write("=" * 80 + "\n\n")
        self._fh.flush()

    def _next_entry(self, label: str) -> None:
        if not self._fh:
            return
        self._entry += 1
        elapsed = (datetime.now(UTC) - self._start).total_seconds()
        self._fh.write(f"--- [{self._entry}] +{elapsed:.2f}s {label} ---\n")

    def request(self, phase: str, *, url: str = "", body: object = None) -> None:
        if not self._fh:
            return
        self._next_entry(f"REQUEST ({phase})")
        if url:
            self._fh.write(f"URL: {url}\n")
        self._fh.write(f"Body:\n{_pretty(body)}\n\n")
        self._fh.flush()

    def response(self, phase: str, *, status: int = 0, body: object = None) -> None:
        if not self._fh:
            return
        self._next_entry(f"RESPONSE ({phase})")
        if status:
            self._fh.write(f"Status: {status}\n")
        self._fh.write(f"Body:\n{_pretty(body)}\n\n")
        self._fh.flush()

    def tool_call(self, tool_name: str, *, args: object = None, result: object = None) -> None:
        if not self._fh:
            return
        self._next_entry(f"TOOL ({tool_name})")
        self._fh.write(f"Args:\n{_pretty(args)}\n")
        self._fh.write(f"Result:\n{_pretty(result)}\n\n")
        self._fh.flush()

    def message(self, text: str) -> None:
        if not self._fh:
            return
        self._next_entry("MESSAGE")
        self._fh.write(f"{text}\n\n")
        self._fh.flush()

    def close(self) -> None:
        if self._fh:
            self._fh.write("=" * 80 + "\n")
            self._fh.write(f"Ended: {datetime.now(UTC).isoformat()}\n")
            self._fh.close()
            self._fh = None

    def __enter__(self) -> Self:
        return self

    def __exit__(self, exc_type: type[BaseException] | None, exc_val: BaseException | None, exc_tb: object) -> None:
        self.close()

    def __del__(self) -> None:
        if self._fh is not None:
            try:
                self._fh.close()
            except Exception:
                pass
