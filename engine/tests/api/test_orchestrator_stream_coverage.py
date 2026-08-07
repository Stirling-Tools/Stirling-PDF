from __future__ import annotations

import asyncio

import pytest

from stirling.api.routes.orchestrator import (
    _ErrorFrame,
    _HeartbeatFrame,
    _OrchestratorStream,
    _ProgressFrame,
    _ResultFrame,
    _serialize_frame,
)
from stirling.contracts import OrchestratorRequest, UnsupportedCapabilityResponse, WholeDocReadDone

# The stream is exercised with a minimal agent double.
# pyright: reportArgumentType=false


def test_serialize_stream_frames() -> None:
    event = WholeDocReadDone(completed=1, slices=1, duration_seconds=0.1)
    assert b'"event": "progress"' in _serialize_frame(_ProgressFrame(event))
    response = UnsupportedCapabilityResponse(capability="test", message="no")
    assert b'"event": "result"' in _serialize_frame(_ResultFrame(response))
    assert b'"event": "error"' in _serialize_frame(_ErrorFrame("failed"))
    assert b'"event": "heartbeat"' in _serialize_frame(_HeartbeatFrame())


@pytest.mark.anyio
async def test_stream_emits_result_and_error_frames() -> None:
    request = OrchestratorRequest(user_message="hello")
    success_agent = SimpleAgent(UnsupportedCapabilityResponse(capability="test", message="ok"))
    stream = _OrchestratorStream(agent=success_agent, request=request, heartbeat_interval_seconds=100)
    frames = [frame async for frame in stream.iterate()]
    assert any(b'"event": "result"' in frame for frame in frames)

    failing_agent = SimpleAgent(RuntimeError("boom"))
    stream = _OrchestratorStream(agent=failing_agent, request=request, heartbeat_interval_seconds=100)
    frames = [frame async for frame in stream.iterate()]
    assert any(b'"event": "error"' in frame for frame in frames)


class SimpleAgent:
    def __init__(self, result: object) -> None:
        self.result = result

    async def handle(self, _request: OrchestratorRequest) -> object:
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


@pytest.mark.anyio
async def test_stream_progress_and_task_cancellation() -> None:
    stream = _OrchestratorStream(
        agent=SimpleAgent(UnsupportedCapabilityResponse(capability="test", message="ok")),
        request=OrchestratorRequest(user_message="hello"),
        heartbeat_interval_seconds=0.001,
    )
    event = WholeDocReadDone(completed=1, slices=1, duration_seconds=0.1)
    await stream._emit_progress(event)
    assert isinstance(await stream._queue.get(), _ProgressFrame)

    heartbeat = asyncio.create_task(stream._emit_heartbeats())
    await asyncio.sleep(0.005)
    await stream._cancel_task(heartbeat)
    done = asyncio.create_task(asyncio.sleep(0))
    await done
    await stream._cancel_task(done)
