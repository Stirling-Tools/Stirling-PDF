"""EventEmitter for streaming structured SSE events from agents."""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any


_SENTINEL = object()


class EventEmitter:
    """Queue-based emitter that agents use to stream structured SSE events.

    Each method puts a typed dict onto an internal asyncio.Queue.
    The ``events()`` async generator yields these for the SSE endpoint to drain.
    """

    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        self._queue: asyncio.Queue[dict[str, Any] | object] = asyncio.Queue()
        self._counter = 0
        self._timers: dict[str, float] = {}

    def _next_id(self, name: str) -> str:
        self._counter += 1
        slug = name.lower().replace(" ", "_")
        return f"{slug}_{self._counter}"

    def _put(self, event_type: str, data: dict[str, Any]) -> None:
        data["runId"] = self.run_id
        self._queue.put_nowait({"event": event_type, "data": data})

    # ------------------------------------------------------------------
    # Public API — called by agents
    # ------------------------------------------------------------------

    def agent_start(self, agent_name: str, parent_agent_id: str | None = None) -> str:
        """Emit an agent_start event and return the generated agentId."""
        agent_id = self._next_id(agent_name)
        self._timers[agent_id] = time.monotonic()
        self._put(
            "agent_start",
            {
                "agentId": agent_id,
                "agentName": agent_name,
                "parentAgentId": parent_agent_id,
            },
        )
        return agent_id

    def token(self, agent_id: str, delta: str) -> None:
        """Emit a streaming text chunk."""
        self._put("token", {"agentId": agent_id, "delta": delta})

    def agent_complete(
        self,
        agent_id: str,
        *,
        status: str = "success",
        result_summary: str | None = None,
    ) -> None:
        """Emit an agent_complete event."""
        start = self._timers.pop(agent_id, None)
        duration_ms = int((time.monotonic() - start) * 1000) if start is not None else None
        data: dict[str, Any] = {"agentId": agent_id, "status": status}
        if result_summary is not None:
            data["resultSummary"] = result_summary
        if duration_ms is not None:
            data["durationMs"] = duration_ms
        self._put("agent_complete", data)

    def action_required(
        self,
        agent_id: str,
        action_type: str,
        action_payload: Any,
    ) -> None:
        """Emit an action_required event (e.g. PDF edit request)."""
        self._put(
            "action_required",
            {
                "agentId": agent_id,
                "actionType": action_type,
                "actionPayload": action_payload,
            },
        )

    def error(self, agent_id: str, error_message: str) -> None:
        """Emit an error event."""
        self._put("error", {"agentId": agent_id, "error": error_message})

    def done(self) -> None:
        """Emit done and signal end of stream."""
        self._put("done", {})
        self._queue.put_nowait(_SENTINEL)

    # ------------------------------------------------------------------
    # Consumer API — used by the SSE endpoint
    # ------------------------------------------------------------------

    async def events(self):
        """Async generator that yields (event_type, json_data) tuples."""
        while True:
            item = await self._queue.get()
            if item is _SENTINEL:
                return
            assert isinstance(item, dict)
            yield item["event"], json.dumps(item["data"], ensure_ascii=False)
