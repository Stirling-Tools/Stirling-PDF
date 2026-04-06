"""Sub-agent for summarizing text via AI with token streaming."""

from __future__ import annotations

from pydantic_ai import Agent

from stirling.services import AppRuntime
from stirling.streaming import EventEmitter


class SummarizationSubAgent:
    """Summarizes text using the smart AI model, streaming tokens to the emitter."""

    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.agent = Agent(
            model=runtime.smart_model,
            system_prompt=(
                "You are a document summarization expert. "
                "Produce a clear, well-structured summary of the provided text. "
                "Include key findings, main topics, and important details. "
                "Use markdown formatting for readability."
            ),
            model_settings=runtime.smart_model_settings,
        )

    async def handle(
        self,
        text: str,
        emitter: EventEmitter,
        parent_agent_id: str,
        *,
        user_instruction: str = "",
    ) -> str:
        agent_id = emitter.agent_start("Summarization", parent_agent_id)

        prompt = f"Summarize the following document:\n\n{text}"
        if user_instruction:
            prompt = f"{user_instruction}\n\nDocument text:\n\n{text}"

        accumulated = ""
        async with self.agent.run_stream(prompt) as stream:
            async for chunk in stream.stream_text(delta=True):
                emitter.token(agent_id, chunk)
                accumulated += chunk

        emitter.agent_complete(
            agent_id,
            status="success",
            result_summary=f"Generated {len(accumulated.split()):,} word summary",
        )
        return accumulated
