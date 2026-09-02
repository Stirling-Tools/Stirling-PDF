from __future__ import annotations

import logging
from typing import Annotated

from pydantic import BeforeValidator, Field
from pydantic_ai import Agent, FunctionToolset, RunContext, ToolDefinition
from pydantic_ai.exceptions import AgentRunError
from pydantic_ai.output import NativeOutput
from pydantic_ai.toolsets import AbstractToolset

from stirling.models import ApiModel
from stirling.product_docs.manifest import DocsManifest, load_manifest
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)

_SELECTOR_SYSTEM_PROMPT = (
    "You are choosing which Stirling PDF documentation pages could answer a question.\n"
    "You will be given the full catalogue, one page per line, as:\n"
    "  id | section | title | description\n"
    "Return the ids of the pages most likely to contain the answer, best first.\n"
    "Rules:\n"
    "- Return ids EXACTLY as they appear in the catalogue. Never invent one.\n"
    "- Return at most 3. Prefer one or two precise pages over a broad sweep.\n"
    "- An overview page plus the specific page it points at is a good pair.\n"
    "- Return an empty list if nothing in the catalogue is plausibly relevant."
)

# Tool results are data the model reads, not orders it follows - the sibling contradiction
# capability tells it as much. So these state a fact and leave the "then what" to the system
# prompt, which already says not to answer product questions from memory.
_NO_MATCH = "The documentation has no page covering that."
_LOOKUP_FAILED = "The documentation lookup failed, so no pages were retrieved."

_INSTRUCTIONS = (
    "The 'search_docs' tool searches the Stirling PDF product documentation - the same "
    "manual published at docs.stirlingpdf.com. Use it for questions about the application "
    "itself rather than about an attached file: what a setting or configuration option does, "
    "how to install or deploy, how to enable a feature, what a tool in the app is for, or "
    "why the app behaves a certain way. It does not know anything about the user's documents."
)


# Mirrors DEFAULT_MAX_READS / DEFAULT_MAX_AUDITS on the sibling capabilities.
DEFAULT_MAX_SEARCHES = 3

# Measured on the shipped corpus: p50 page 5,110 chars, p90 14,192, three largest 81,880. A cap
# that never binds is not a cap, so this sits above a normal three-page answer and below the
# pathological one. With DEFAULT_MAX_SEARCHES that is ~120k chars of manual per turn, worst case.
DEFAULT_MAX_BODY_CHARS = 40_000


class _DocSelection(ApiModel):
    # Local models add stray fields and send null for optional ones; tolerate both. A bare
    # default_factory covers only an absent key - an explicit null still fails validation.
    model_config = ApiModel.model_config | {"extra": "ignore"}
    ids: Annotated[list[str], BeforeValidator(lambda v: v or [])] = Field(default_factory=list)


class DocsCapability:
    """Bundles the product-documentation lookup and its ``search_docs`` tool for agent injection.

    Shaped like :class:`~stirling.documents.rag_capability.RagCapability` so an agent mounts
    it the same way::

        docs = DocsCapability(runtime)
        Agent(..., instructions=[docs.instructions], toolsets=[docs.toolset])

    The two-step lookup lives *inside* the tool call: the catalogue is ~2k tokens and would
    otherwise be paid on every turn, including the majority that never ask about the product.
    Only the short tool description above reaches the outer prompt.

    Lifecycle: one instance per agent run, like the other capabilities.
    """

    def __init__(
        self,
        runtime: AppRuntime,
        manifest: DocsManifest | None = None,
        *,
        max_searches: int = DEFAULT_MAX_SEARCHES,
        max_body_chars: int = DEFAULT_MAX_BODY_CHARS,
    ) -> None:
        self._manifest = manifest if manifest is not None else load_manifest()
        self._max_searches = max_searches
        self._max_body_chars = max_body_chars
        self._search_count = 0
        # The selector has no tools of its own, so NativeOutput is safe on Ollama here -
        # same reasoning as the top-level router.
        self._selector: Agent[None, _DocSelection] = Agent(
            model=runtime.fast_model,
            output_type=NativeOutput(_DocSelection),
            system_prompt=_SELECTOR_SYSTEM_PROMPT,
            model_settings=runtime.fast_model_settings,
        )
        toolset: FunctionToolset[None] = FunctionToolset()
        toolset.add_function(
            self._search_docs,
            name="search_docs",
            prepare=self._prepare_search_docs,
        )
        self._toolset = toolset

    @property
    def available(self) -> bool:
        """False when no manifest shipped; the tool is then never offered."""
        return len(self._manifest) > 0

    @property
    def instructions(self) -> str:
        return _INSTRUCTIONS if self.available else ""

    @property
    def toolset(self) -> AbstractToolset[None]:
        return self._toolset

    async def _prepare_search_docs(
        self,
        ctx: RunContext[None],
        tool_def: ToolDefinition,
    ) -> ToolDefinition | None:
        """Withhold the tool when there is nothing to search, and once the per-run budget
        is spent, so the agent answers from what it already has instead of looping."""
        if not self.available:
            return None
        if self._search_count >= self._max_searches:
            return None
        return tool_def

    async def _search_docs(self, query: str) -> str:
        """Search the Stirling PDF product documentation and return the most relevant pages.

        Args:
            query: What you need to know about the application, its settings or its tools.

        Returns:
            The full text of the documentation pages that best match, or a note that none did.
        """
        self._search_count += 1
        prompt = f"Question:\n{query}\n\nCatalogue:\n{self._manifest.toc()}"
        try:
            result = await self._selector.run(prompt)
        except (AgentRunError, TimeoutError):
            # An off-schema selector exhausts its retries and raises, which would otherwise
            # unwind the whole question run. Say the lookup broke - reporting it as "nothing
            # covers that" would tell the user the manual lacks a page it actually has.
            logger.warning("[product-docs] selector failed for query=%r", query, exc_info=True)
            return _LOOKUP_FAILED
        # render() caps the page count after dropping unknown and repeated ids, so a repeated
        # id costs one slot rather than two.
        ids = result.output.ids
        logger.info("[product-docs] search_docs query=%r -> %s", query, ids)
        rendered = self._manifest.render(ids, self._max_body_chars)
        if not rendered:
            return _NO_MATCH
        logger.info("[product-docs] search_docs returned %d chars", len(rendered))
        return rendered
