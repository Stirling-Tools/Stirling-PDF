"""
PDF Comment Agent (pdfCommentAgent) — pydantic-ai agent for review comments.

Given a list of positioned text chunks extracted by Java and a user prompt,
the agent selects chunks worth commenting on and returns concise review
comments. Java then applies the actual PDF sticky-note annotations using
the chunk bounding boxes it already holds; the agent never sees the PDF.
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict

from pydantic_ai import Agent

from stirling.agents.pdf_comment.prompts import COMMENT_AGENT_SYSTEM_PROMPT
from stirling.contracts.pdf_comments import (
    PdfCommentInstruction,
    PdfCommentRequest,
    PdfCommentResponse,
    TextChunk,
)
from stirling.logging import Pretty
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)


class PdfCommentAgent:
    """Encapsulates the single-shot PDF comment generation pipeline.

    Instantiated once at app startup with an :class:`AppRuntime`, which
    provides the pre-built fast model and model settings.
    """

    def __init__(self, runtime: AppRuntime) -> None:
        self._runtime = runtime
        self._agent = Agent(
            model=runtime.fast_model,
            output_type=PdfCommentResponse,
            system_prompt=COMMENT_AGENT_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )

    async def generate(self, request: PdfCommentRequest) -> PdfCommentResponse:
        """Run the agent against a ``PdfCommentRequest`` and return comments.

        Short-circuits with an empty response when the input has no chunks.
        Filters out any hallucinated ``chunk_id`` values returned by the
        model as a defence-in-depth guard — the system prompt forbids them
        but we never trust LLM output. Agent failures propagate to the
        caller (FastAPI translates to HTTP 5xx) rather than being silently
        swallowed; callers need to know when the agent failed.
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

        filtered_comments = self._filter_hallucinated_ids(request, output.comments)
        response = PdfCommentResponse(
            session_id=session_id,
            comments=filtered_comments,
            rationale=output.rationale,
        )
        logger.debug(
            "RESPONSE (pdf-comment-agent generate)\n%s",
            Pretty(response.model_dump()),
        )
        return response

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_prompt(request: PdfCommentRequest) -> str:
        """Build a structured prompt with chunks grouped by page.

        Both the user's free-text prompt and each chunk's text are JSON-
        encoded so any quotes, newlines, or stray delimiters in attacker-
        influenced content (the user message or PDF-derived chunks) are
        escaped and cannot break out of the prompt structure or spoof
        additional chunk records.
        """
        by_page: dict[int, list[TextChunk]] = defaultdict(list)
        for chunk in request.chunks:
            by_page[chunk.page].append(chunk)

        lines: list[str] = [
            "User prompt (JSON-encoded, untrusted input):",
            json.dumps(request.user_message),
            "",
            f"Chunks ({len(request.chunks)} total across {len(by_page)} page(s)).",
            "Each chunk is a JSON object; the `id` field is what you must echo",
            "back on any comment that targets this chunk.",
            "",
        ]
        for page_idx in sorted(by_page):
            # 1-index the page label for the model; chunk ids remain 0-indexed
            # since that's what Java will use to resolve them.
            lines.append(f"--- Page {page_idx + 1} ---")
            for chunk in by_page[page_idx]:
                # exclude= strips the bbox fields the model doesn't need to see;
                # keeping the payload tight and avoiding incidental prompt-
                # injection surface area from numeric edge cases.
                lines.append(
                    chunk.model_dump_json(
                        include={"id", "text"},
                        by_alias=True,
                    )
                )
            lines.append("")
        return "\n".join(lines)

    @staticmethod
    def _filter_hallucinated_ids(
        request: PdfCommentRequest,
        comments: list[PdfCommentInstruction],
    ) -> list[PdfCommentInstruction]:
        known_ids = {chunk.id for chunk in request.chunks}
        kept: list[PdfCommentInstruction] = []
        dropped: list[str] = []
        for comment in comments:
            if comment.chunk_id in known_ids:
                kept.append(comment)
            else:
                dropped.append(comment.chunk_id)

        if dropped:
            logger.warning(
                "[pdf-comment-agent] session=%s dropped %d comment(s) with unknown chunk ids: %s",
                request.session_id,
                len(dropped),
                dropped,
            )
        return kept
