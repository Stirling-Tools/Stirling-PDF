"""SSE response helper for FastAPI."""

from __future__ import annotations

from starlette.responses import StreamingResponse

from stirling.streaming.event_emitter import EventEmitter


async def _sse_generator(emitter: EventEmitter):
    async for event_type, json_data in emitter.events():
        yield f"event: {event_type}\ndata: {json_data}\n\n"


def create_sse_response(emitter: EventEmitter) -> StreamingResponse:
    """Create a StreamingResponse that drains events from the emitter as SSE."""
    return StreamingResponse(
        _sse_generator(emitter),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
