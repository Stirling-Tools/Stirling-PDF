from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated, assert_never

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from stirling.agents import OrchestratorAgent
from stirling.api.dependencies import get_orchestrator_agent
from stirling.contracts import OrchestratorRequest, OrchestratorResponse, ProgressEvent
from stirling.services import reset_progress_emitter, set_progress_emitter

logger = logging.getLogger(__name__)

# Cadence for keep-alive heartbeats on the streaming endpoint. Java forwards
# them to the frontend as SSE comments; their job is to make every layer of
# the connection visibly alive at this rhythm so disconnects surface within a
# bounded window instead of waiting for the next progress event.
HEARTBEAT_INTERVAL_SECONDS = 10.0

router = APIRouter(prefix="/api/v1/orchestrator", tags=["orchestrator"])


@router.post("")
async def orchestrate(
    request: OrchestratorRequest,
    agent: Annotated[OrchestratorAgent, Depends(get_orchestrator_agent)],
) -> StreamingResponse:
    """Run the orchestrator and stream NDJSON events.

    Each output line is a JSON object with an ``event`` field. ``progress``
    events arrive whenever an inner agent reports work (e.g. each
    chunked-reasoner slice completing); the final ``result`` event carries the
    typed orchestrator response. ``error`` events surface failures without
    breaking the connection. ``heartbeat`` events fire on a fixed cadence to
    keep idle connections visibly alive so disconnects propagate.

    The stream itself is the liveness signal: as long as events flow, work is
    alive. Java consumes this with a long total timeout and treats line
    arrival as forward progress.
    """
    return StreamingResponse(
        _OrchestratorStream(
            agent=agent,
            request=request,
            heartbeat_interval_seconds=HEARTBEAT_INTERVAL_SECONDS,
        ).iterate(),
        media_type="application/x-ndjson",
    )


@dataclass(frozen=True, slots=True)
class _ProgressFrame:
    event: ProgressEvent


@dataclass(frozen=True, slots=True)
class _ResultFrame:
    response: OrchestratorResponse


@dataclass(frozen=True, slots=True)
class _ErrorFrame:
    message: str


@dataclass(frozen=True, slots=True)
class _HeartbeatFrame:
    """No payload: a heartbeat exists only to push bytes through the pipe.

    Without periodic traffic, a slow workflow phase (e.g. all extractor
    workers busy on long calls) leaves the engine writer, Java's SSE
    forwarder, and the frontend's fetch all silently waiting. A closed
    connection at any layer wouldn't surface until the next real event,
    which could be many tens of seconds away. Heartbeats bound that window
    to :data:`HEARTBEAT_INTERVAL_SECONDS`.
    """


type _StreamFrame = _ProgressFrame | _ResultFrame | _ErrorFrame | _HeartbeatFrame


def _serialize_frame(frame: _StreamFrame) -> bytes:
    """Render a frame as one NDJSON line."""
    match frame:
        case _ProgressFrame(event=event):
            body = {"event": "progress", **event.model_dump(mode="json")}
        case _ResultFrame(response=response):
            body = {"event": "result", "response": response.model_dump(mode="json")}
        case _ErrorFrame(message=message):
            body = {"event": "error", "message": message}
        case _HeartbeatFrame():
            body = {"event": "heartbeat"}
        case _:
            assert_never(frame)
    return (json.dumps(body) + "\n").encode("utf-8")


class _OrchestratorStream:
    """Drives one streaming orchestrator request.

    Owns the per-request queue and pumps progress events through it; the agent
    runs as a child task so its emissions and the streaming response interleave.
    A heartbeat task pushes keep-alive messages onto the same queue at a fixed
    cadence so the connection stays visibly alive between progress events.
    """

    def __init__(
        self,
        *,
        agent: OrchestratorAgent,
        request: OrchestratorRequest,
        heartbeat_interval_seconds: float,
    ) -> None:
        self._agent = agent
        self._request = request
        self._heartbeat_interval_seconds = heartbeat_interval_seconds
        self._queue: asyncio.Queue[_StreamFrame | None] = asyncio.Queue()

    async def iterate(self) -> AsyncIterator[bytes]:
        token = set_progress_emitter(self._emit_progress)
        agent_task = asyncio.create_task(self._run_agent())
        heartbeat_task = asyncio.create_task(self._emit_heartbeats())
        try:
            while True:
                frame = await self._queue.get()
                if frame is None:
                    break
                yield _serialize_frame(frame)
        finally:
            reset_progress_emitter(token)
            await self._cancel_task(heartbeat_task)
            await self._cancel_task(agent_task)

    async def _emit_progress(self, event: ProgressEvent) -> None:
        await self._queue.put(_ProgressFrame(event=event))

    async def _emit_heartbeats(self) -> None:
        while True:
            await asyncio.sleep(self._heartbeat_interval_seconds)
            await self._queue.put(_HeartbeatFrame())

    async def _run_agent(self) -> None:
        try:
            response = await self._agent.handle(self._request)
            await self._queue.put(_ResultFrame(response=response))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("orchestrator stream failed")
            await self._queue.put(_ErrorFrame(message=str(exc)))
        finally:
            await self._queue.put(None)

    @staticmethod
    async def _cancel_task(task: asyncio.Task[None]) -> None:
        if task.done():
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("background task failed during cancellation", exc_info=True)
