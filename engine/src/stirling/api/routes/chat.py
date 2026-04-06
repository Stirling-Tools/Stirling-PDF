"""SSE streaming chat endpoint and agent list endpoint."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from starlette.responses import StreamingResponse

from stirling.agents.chat_agents import StreamingOrchestrator
from stirling.agents.registry import AgentRegistry
from stirling.contracts.chat import AgentMetaResponse, ChatRequest
from stirling.streaming import EventEmitter, create_sse_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


def get_streaming_orchestrator(request: Request) -> StreamingOrchestrator:
    return request.app.state.streaming_orchestrator


def get_agent_registry(request: Request) -> AgentRegistry:
    return request.app.state.agent_registry


@router.post("/stream")
async def chat_stream(
    chat_request: ChatRequest,
    orchestrator: Annotated[StreamingOrchestrator, Depends(get_streaming_orchestrator)],
) -> StreamingResponse:
    """Start a streaming chat session.  Returns an SSE event stream."""
    run_id = uuid.uuid4().hex[:12]
    emitter = EventEmitter(run_id)
    logger.info("Chat stream started: run_id=%s, message=%r", run_id, chat_request.message[:80])

    async def _run_orchestrator():
        try:
            await orchestrator.handle(chat_request, emitter)
        except Exception as exc:
            logger.exception("Orchestrator failed for run_id=%s", run_id)
            emitter.error("orchestrator", str(exc))
            emitter.done()

    # Launch orchestrator in the background; the SSE response drains the emitter.
    asyncio.create_task(_run_orchestrator())

    return create_sse_response(emitter)


@router.get("/agents")
async def list_agents(
    registry: Annotated[AgentRegistry, Depends(get_agent_registry)],
) -> list[AgentMetaResponse]:
    """List all available chat agents."""
    return [
        AgentMetaResponse(
            agent_id=meta.agent_id,
            name=meta.name,
            description=meta.description,
            category=meta.category,
        )
        for meta in registry.list_all()
    ]
