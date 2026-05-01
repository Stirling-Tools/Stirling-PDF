"""
Shared concurrency helpers for agent pipelines.

Both the math auditor and contradiction agents fan out per-page LLM work
under an ``asyncio.Semaphore``. This module provides the shared
``throttled`` wrapper so neither agent has to re-implement it and we
avoid forcing them to inherit from a common base class.
"""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from typing import Any


async def throttled[T](coro: Coroutine[Any, Any, T], sem: asyncio.Semaphore) -> T:
    """Wrap a coroutine with a concurrency semaphore.

    Acquires ``sem`` before awaiting ``coro`` so callers can bound how
    many in-flight LLM calls or other expensive operations are running
    concurrently. The coroutine is awaited at most once and any
    exception it raises propagates after the semaphore is released.
    """
    async with sem:
        return await coro
