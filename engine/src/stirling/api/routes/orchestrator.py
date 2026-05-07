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

router = APIRouter(prefix="/api/v1/orchestrator", tags=["orchestrator"])


@router.post("", response_model=OrchestratorResponse)
async def orchestrate(
    request: OrchestratorRequest,
    agent: Annotated[OrchestratorAgent, Depends(get_orchestrator_agent)],
) -> OrchestratorResponse:
    return await agent.handle(request)


@router.post("/stream")
async def orchestrate_stream(
    request: OrchestratorRequest,
    agent: Annotated[OrchestratorAgent, Depends(get_orchestrator_agent)],
) -> StreamingResponse:
    """Run the orchestrator and stream NDJSON events.

    Each output line is a JSON object with an ``event`` field. ``progress``
    events arrive whenever an inner agent reports work (e.g. each
    chunked-reasoner slice completing); the final ``result`` event carries the
    same body the unary endpoint would have returned. ``error`` events surface
    failures without breaking the connection.

    The stream itself is the timeout signal: as long as events flow, work is
    alive. Java consumes this with a long total timeout and treats line
    arrival as liveness.
    """
    return StreamingResponse(
        _OrchestratorStream(agent=agent, request=request).iterate(),
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


type _StreamFrame = _ProgressFrame | _ResultFrame | _ErrorFrame


def _serialize_frame(frame: _StreamFrame) -> bytes:
    """Render a frame as one NDJSON line."""
    match frame:
        case _ProgressFrame(event=event):
            body = {"event": "progress", **event.model_dump(mode="json")}
        case _ResultFrame(response=response):
            body = {"event": "result", "response": response.model_dump(mode="json")}
        case _ErrorFrame(message=message):
            body = {"event": "error", "message": message}
        case _:
            assert_never(frame)
    return (json.dumps(body) + "\n").encode("utf-8")


class _OrchestratorStream:
    """Drives one streaming orchestrator request.

    Owns the per-request queue and pumps progress events through it; the agent
    runs as a child task so its emissions and the streaming response interleave.
    """

    def __init__(self, *, agent: OrchestratorAgent, request: OrchestratorRequest) -> None:
        self._agent = agent
        self._request = request
        self._queue: asyncio.Queue[_StreamFrame | None] = asyncio.Queue()

    async def iterate(self) -> AsyncIterator[bytes]:
        token = set_progress_emitter(self._emit_progress)
        agent_task = asyncio.create_task(self._run_agent())
        try:
            while True:
                frame = await self._queue.get()
                if frame is None:
                    break
                yield _serialize_frame(frame)
        finally:
            reset_progress_emitter(token)
            await self._cancel_agent_task(agent_task)

    async def _emit_progress(self, event: ProgressEvent) -> None:
        await self._queue.put(_ProgressFrame(event=event))

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
    async def _cancel_agent_task(task: asyncio.Task[None]) -> None:
        if task.done():
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("background orchestrator task failed during cancellation", exc_info=True)
