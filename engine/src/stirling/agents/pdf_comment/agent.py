"""
PDF Comment Agent (pdfCommentAgent) — pydantic-ai agent for review comments.

Given a list of positioned text chunks extracted by Java and a user prompt,
the agent selects chunks worth commenting on and returns concise review
comments. Java then applies the actual PDF sticky-note annotations using
the chunk bounding boxes it already holds; the agent never sees the PDF.

The model only fills in fields it's well-suited to fill: a chunk ordinal
(a small bounded int) and the comment text. All non-LLM fields (the real
``chunk_id`` echoed back to Java) are filled in by Python after the call,
so the LLM has no opportunity to hallucinate opaque string identifiers.
"""

from __future__ import annotations

import json
import logging

from pydantic import Field
from pydantic_ai import Agent

from stirling.agents.pdf_comment.prompts import COMMENT_AGENT_SYSTEM_PROMPT
from stirling.contracts.pdf_comments import (
    MAX_COMMENT_TEXT_LENGTH,
    PdfCommentInstruction,
    PdfCommentRequest,
    PdfCommentResponse,
    TextChunk,
)
from stirling.logging import Pretty
from stirling.models import ApiModel
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


class LlmCommentInstruction(ApiModel):
    """LLM-facing comment shape — only fields the model is well-suited to fill.

    ``chunk_index`` is the ordinal of the chunk in the input list (0-based).
    Bounds are sanity-checked in agent code after the call; an ordinal is
    structurally much harder to hallucinate than the opaque ``chunk_id``
    string used on the Java-facing contract.
    """

    chunk_index: int = Field(
        ge=0,
        description="0-based index of the chunk in the input list this comment anchors to.",
    )
    comment_text: str = Field(
        min_length=1,
        max_length=MAX_COMMENT_TEXT_LENGTH,
        description="The comment body shown in the sticky-note popup. One or two sentences.",
    )
    author: str | None = Field(default=None, max_length=128)
    subject: str | None = Field(default=None, max_length=256)


class LlmCommentOutput(ApiModel):
    """Structured output the LLM returns. Translated to ``PdfCommentResponse``
    by the agent before reaching Java.
    """

    comments: list[LlmCommentInstruction] = Field(default_factory=list)
    rationale: str = Field(max_length=1_000)


class PdfCommentAgent:
    """Encapsulates the single-shot PDF comment generation pipeline.

    Instantiated once at app startup with an :class:`AppRuntime`, which
    provides the pre-built fast model and model settings.
    """

    def __init__(self, runtime: AppRuntime) -> None:
        self._runtime = runtime
        self._agent = Agent(
            model=runtime.fast_model,
            output_type=LlmCommentOutput,
            system_prompt=COMMENT_AGENT_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )

    async def generate(self, request: PdfCommentRequest) -> PdfCommentResponse:
        """Run the agent against a ``PdfCommentRequest`` and return comments.

        Short-circuits with an empty response when the input has no chunks.
        Any out-of-range ``chunk_index`` returned by the model is dropped
        (this should be vanishingly rare given the bounded int surface).
        Agent failures propagate to the caller (FastAPI translates to HTTP
        5xx) rather than being silently swallowed; callers need to know
        when the agent failed.
        """
        session_id = request.session_id
        logger.info(
            "[pdf-comment-agent] session=%s generating comments for %d chunks",
            session_id,
            len(request.chunks),
        )
        logger.debug(
            "REQUEST (pdf-comment-agent generate)\n%s",
            Pretty(
                {
                    "session_id": session_id,
                    "user_message": request.user_message,
                    "chunk_count": len(request.chunks),
                }
            ),
        )

        if not request.chunks:
            logger.debug(
                "[pdf-comment-agent] session=%s no chunks; skipping agent call",
                session_id,
            )
            return PdfCommentResponse(
                session_id=session_id,
                comments=[],
                rationale="No text chunks were provided; no comments generated.",
            )

        prompt = self._build_prompt(request)
        result = await self._agent.run(prompt)
        output = result.output

        comments = self._map_to_instructions(request.chunks, output.comments, session_id)
        response = PdfCommentResponse(
            session_id=session_id,
            comments=comments,
            rationale=output.rationale,
        )
        logger.debug(
            "RESPONSE (pdf-comment-agent generate)\n%s",
            Pretty(response),
        )
        return response

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_prompt(request: PdfCommentRequest) -> str:
        """Build a structured prompt with chunks listed by ordinal index.

        Both the user's free-text prompt and each chunk's text are JSON-
        encoded so any quotes, newlines, or stray delimiters in attacker-
        influenced content (the user message or PDF-derived chunks) are
        escaped and cannot break out of the prompt structure.
        """
        lines: list[str] = [
            "User prompt (JSON-encoded, untrusted input):",
            json.dumps(request.user_message),
            "",
            f"Chunks ({len(request.chunks)} total). Each line shows the chunk index",
            "you must return on `chunk_index`, the 1-indexed page number, and the",
            "JSON-encoded text content.",
            "",
        ]
        for index, chunk in enumerate(request.chunks):
            lines.append(f"[{index}] page={chunk.page + 1} text={json.dumps(chunk.text)}")
        return "\n".join(lines)

    @staticmethod
    def _map_to_instructions(
        chunks: list[TextChunk],
        llm_comments: list[LlmCommentInstruction],
        session_id: str,
    ) -> list[PdfCommentInstruction]:
        """Translate LLM ordinal-based output into the Java-facing contract,
        dropping any out-of-range ordinals as a defence-in-depth guard.
        """
        kept: list[PdfCommentInstruction] = []
        dropped: list[int] = []
        for comment in llm_comments:
            if 0 <= comment.chunk_index < len(chunks):
                kept.append(
                    PdfCommentInstruction(
                        chunk_id=chunks[comment.chunk_index].id,
                        comment_text=comment.comment_text,
                        author=comment.author,
                        subject=comment.subject,
                    )
                )
            else:
                dropped.append(comment.chunk_index)

        if dropped:
            logger.warning(
                "[pdf-comment-agent] session=%s dropped %d comment(s) with out-of-range chunk_index: %s",
                session_id,
                len(dropped),
                dropped,
            )
        return kept
