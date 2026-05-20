"""Per-request progress emission, plumbed via a ContextVar so deep call stacks
can publish typed events to the streaming orchestrator endpoint without every
intermediate layer knowing about it.

Outside a streaming request no emitter is bound and ``emit_progress`` is a
no-op, so callers in agents/services can emit unconditionally.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from contextvars import ContextVar, Token

from stirling.contracts import ProgressEvent

logger = logging.getLogger(__name__)

type ProgressEmitter = Callable[[ProgressEvent], Awaitable[None]]

_emitter: ContextVar[ProgressEmitter | None] = ContextVar("stirling_progress_emitter", default=None)


def set_progress_emitter(emitter: ProgressEmitter | None) -> Token[ProgressEmitter | None]:
    return _emitter.set(emitter)


def reset_progress_emitter(token: Token[ProgressEmitter | None]) -> None:
    _emitter.reset(token)


async def emit_progress(event: ProgressEvent) -> None:
    """Publish ``event`` to the current request's emitter, if any.

    Failures inside the emitter are logged and swallowed so progress emission
    can never break the work it's reporting on.
    """
    emitter = _emitter.get()
    if emitter is None:
        return
    try:
        await emitter(event)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("progress emitter raised; dropping event %r", event.phase)
