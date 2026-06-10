"""PDF Create Agent — chunked multi-agent pipeline.

Flow:
  1. MetaPlannerAgent (smart_model) analyses the request and produces DocumentMeta:
     title, tone, shared terms, style, and cannot_do_reason. No sections yet.
  2. SectionPlannerAgent (smart_model) reads the meta and produces DocumentSections:
     ordered list of PlannedSection with heading, type, depth, and key_points.
  3. Python assembles DocumentPlan from meta + sections, then groups sections into
     chunks, each staying under the output-token ceiling.
  4. SectionWriterAgents (smart_model) run in parallel via asyncio.gather.
     Each returns a WrittenSections with fully populated DocumentSection objects.
  5. The assembler collects sections in plan order → GeneratedDocument.
  6. Jinja renders the document to HTML. The LLM never writes HTML.

The planner is split into two calls (meta then sections) so each LLM output schema
stays small enough for grammar compilation on all model tiers including Haiku.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from pydantic_ai import Agent
from pydantic_ai.output import NativeOutput

from stirling.contracts import (
    EditCannotDoResponse,
    EditPlanResponse,
    OrchestratorRequest,
    ToolOperationStep,
    format_conversation_history,
)
from stirling.contracts.pdf_create import (
    DocumentMeta,
    DocumentPlan,
    DocumentSection,
    DocumentSections,
    GeneratedDocument,
    PdfCreateOrchestrateResponse,
    PlannedSection,
    SectionDepth,
    WrittenSections,
)
from stirling.models.agent_tool_models import AgentToolId, CreatePdfFromHtmlAgentParams
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = Path(__file__).parent / "templates"

# ── Token budget ──────────────────────────────────────────────────────────────────────────────────

# Conservative per-section token estimates mapped from planner-assigned depth.
_DEPTH_TOKENS: dict[SectionDepth, int] = {
    SectionDepth.BRIEF: 250,
    SectionDepth.STANDARD: 550,
    SectionDepth.DETAILED: 1200,
}

# Maximum output tokens per writer call. Stays well below the quality cliff (~4k).
_CHUNK_CEILING = 3000

# Cap on simultaneous writer calls so a large document doesn't open a burst of LLM
# connections and trip provider rate limits.
_MAX_PARALLEL_WRITERS = 10

# ── Chunk dataclass ───────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class _Chunk:
    index: int
    sections: list[PlannedSection]
    # Descriptions of neighbouring chunks from the plan — passed to writers as
    # read-only context so they can open/close their sections naturally.
    context_before: str | None
    context_after: str | None


# ── Chunking logic ────────────────────────────────────────────────────────────────────────────────


def _describe_sections(sections: list[PlannedSection]) -> str:
    """One-line summary of a chunk used as neighbour context."""
    return "; ".join(f'"{s.heading}" ({s.type.value})' for s in sections)


def _make_chunks(sections: list[PlannedSection]) -> list[_Chunk]:
    """Group planned sections into chunks, each under _CHUNK_CEILING output tokens.

    Section boundaries are atomic — a section is never split across chunks.
    A single section whose estimated cost exceeds the ceiling gets its own chunk.
    asyncio.gather preserves insertion order so chunk index is only used for logging.
    """
    if not sections:
        return []

    groups: list[list[PlannedSection]] = []
    current: list[PlannedSection] = []
    current_tokens = 0

    for section in sections:
        cost = _DEPTH_TOKENS[section.depth]
        if current and current_tokens + cost > _CHUNK_CEILING:
            groups.append(current)
            current = [section]
            current_tokens = cost
        else:
            current.append(section)
            current_tokens += cost

    if current:
        groups.append(current)

    chunks: list[_Chunk] = []
    for i, group in enumerate(groups):
        context_before = _describe_sections(groups[i - 1]) if i > 0 else None
        context_after = _describe_sections(groups[i + 1]) if i < len(groups) - 1 else None
        chunks.append(
            _Chunk(
                index=i,
                sections=group,
                context_before=context_before,
                context_after=context_after,
            )
        )

    return chunks


# ── Prompts ───────────────────────────────────────────────────────────────────────────────────────

_META_PLANNER_SYSTEM_PROMPT = """\
You are a document planner. Your job is Step 1 of 2: produce the document header — NOT the
section list (that comes in Step 2) and NOT any body text (section writers handle that).

Analyse the user's request and produce a DocumentMeta with:

- title, subtitle (if appropriate), reference_number (only if the user supplies one explicitly)

- tone_brief: one sentence describing register and style
  (e.g. "Formal legal language, third person, present tense." or
  "Professional business tone, active voice.")

- shared_terms: consistent names for key entities AND ground-truth facts used throughout
  the document. Two rules:
  1. Capture EVERY value the user states explicitly that could be referenced in more than
     one section. This includes — but is not limited to:
       · Named parties, organisations, products, or systems
       · Numeric values: amounts, quantities, percentages, durations, limits
       · Identifiers: version numbers, reference codes, model names
       · Dates and time periods
       · Units of measure or currency
  2. For any fact that will appear in two or more sections and that the user did NOT specify
     (e.g. a default time, a standard rate, a typical threshold), assign ONE specific value
     here. Do NOT let multiple writers independently invent the same fact.
  Examples: {"the Agreement": "this Non-Disclosure Agreement", "the Client": "Acme Corp",
             "contract value": "£120,000", "notice period": "30 days"}

- document_context: a single sentence anchoring the temporal or versioning context of the
  document, if the user provides one. Leave empty if the user provides no such context.

- style_primary_color: accent and heading colour. Set ONLY when the user explicitly names a
  colour or colour scheme (e.g. "make it red", "use navy blue"). Use CSS named colours
  (e.g. "magenta", "navy", "crimson") or hex values. Leave null if no colour is stated.
- style_background_color: page background colour. Set only if explicitly requested.
- style_body_text_color: body text colour. Set only if explicitly requested.

- cannot_do_reason: set this ONLY when the request is not asking to create a document at all
  (e.g. a question, a greeting, an edit request to an existing document). Never set it
  because the document is large, complex, or technically detailed. Leave null otherwise.

RULES:
1. Extract ALL information the user provides. Do not invent content.
2. Do not produce any sections — that is Step 2.
"""

_SECTIONS_PLANNER_SYSTEM_PROMPT = """\
You are a document planner. Your job is Step 2 of 2: produce the ordered section list for
a document whose header has already been decided. Do NOT write any body text.

You will be given:
  - The document meta (title, tone, shared terms, etc.) produced in Step 1
  - The original user request

Produce a DocumentSections with an ordered list of PlannedSection objects.

For each section choose:
  type — the most appropriate section type:
    text       — prose paragraphs (narrative, obligations, terms, descriptions)
    key_value  — labelled fields (parties, dates, metadata, identifiers)
    line_items — tables with column headers (expenses, schedules, item lists)
    bullet_list — unordered items (requirements, responsibilities, definitions)
    signature  — sign-off blocks for named parties or roles

  depth — honest estimate of content volume:
    brief    (~250 tokens) — 1-2 items, a short paragraph, or a small table
    standard (~550 tokens) — a few paragraphs, a medium table, or a moderate list
    detailed (~1200 tokens) — long clauses, complex multi-row tables, or dense content

  key_points — specific points this section MUST cover, taken directly from the user's input.
    These are instructions to the writer, not summaries. Be precise and complete.
    Every fact, name, date, amount, and requirement the user provides must appear somewhere.
    For large documents, include enough key_points that the writer can produce substantial
    content.

RULES:
1. Extract ALL information the user provides. Do not invent content.
2. Assign depth honestly — for a long detailed document most sections will be detailed.
3. For large documents, produce as many sections as needed — there is no section count limit.
4. Use the shared_terms from the meta exactly when writing key_points.
"""

_WRITER_SYSTEM_PROMPT = """\
You are a section writer for a structured document.
Write ONLY the sections assigned to you — no extras, no merging, no skipping.

SECTION TYPES — produce sections of exactly the requested type:
  text       — prose paragraphs. Use \\n\\n between paragraphs.
  key_value  — list of (label, value) pairs. Labels ≤ 5 words. Values verbatim from the data.
  line_items — table. Every row must have exactly as many cells as there are columns.
  bullet_list — flat list of items.
  signature  — list of signatory names/roles.

RULES:
1. Write ONLY the sections in your assignment list, in the order given.
2. Cover every key_point listed for each section. Do not omit any.
3. Use the shared_terms exactly — no paraphrasing or substituting alternatives.
   Shared terms are ground truth. If your general knowledge or a common default would
   produce a different value (e.g. a different duration, amount, date, or version number),
   the shared term takes precedence. This applies everywhere in the document, including
   boilerplate, FAQ, and summary sections.
4. Match the depth for each section: brief = concise, standard = moderate, \
detailed = thorough.
5. Maintain the document's tone throughout.
6. Do not reference other sections by number (e.g. "as defined in Section 3").
7. If a document_context is provided, use it to anchor any dates, versions, or time
   references you generate. Do not invent a different temporal or versioning context.
"""


def _build_sections_prompt(meta: DocumentMeta, user_request: str, history: str) -> str:
    lines: list[str] = [
        "Document meta from Step 1:",
        f"  Title: {meta.title}",
        f"  Tone: {meta.tone_brief}",
    ]
    if meta.subtitle:
        lines.append(f"  Subtitle: {meta.subtitle}")
    if meta.document_context:
        lines.append(f"  Document context: {meta.document_context}")
    if meta.shared_terms:
        lines.append("  Shared terms:")
        for term, referent in meta.shared_terms.items():
            lines.append(f"    {term} → {referent}")

    lines.append(f"\nConversation history:\n{history}")
    lines.append(f"\nUser request: {user_request}")
    return "\n".join(lines)


def _build_writer_prompt(plan: DocumentPlan, chunk: _Chunk) -> str:
    lines: list[str] = [
        f"Document: {plan.title}",
        f"Tone: {plan.tone_brief}",
    ]

    if plan.document_context:
        lines.append(f"Document context: {plan.document_context}")

    if plan.shared_terms:
        lines.append("Ground-truth facts and shared terms (use exactly — these override defaults):")
        for term, referent in plan.shared_terms.items():
            lines.append(f"  {term} → {referent}")

    if chunk.context_before:
        lines.append(f"\nThe sections BEFORE yours cover: {chunk.context_before}")
    if chunk.context_after:
        lines.append(f"The sections AFTER yours cover: {chunk.context_after}")

    lines.append(f"\nWrite these {len(chunk.sections)} section(s) in order:")
    for i, s in enumerate(chunk.sections, 1):
        lines.append(f"\n--- Section {i} ---")
        lines.append(f"Heading: {s.heading}")
        lines.append(f"Type: {s.type.value}")
        lines.append(f"Depth: {s.depth.value}")
        lines.append("Key points to cover:")
        for point in s.key_points:
            lines.append(f"  - {point}")

    return "\n".join(lines)


# ── Helpers ───────────────────────────────────────────────────────────────────────────────────────


def _build_jinja_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(_TEMPLATES_DIR)),
        autoescape=True,
        trim_blocks=True,
        lstrip_blocks=True,
    )


def _safe_filename(title: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", title.lower())
    slug = re.sub(r"[\s_-]+", "-", slug).strip("-")
    return (slug[:60] or "document") + ".pdf"


# ── Agent ─────────────────────────────────────────────────────────────────────────────────────────


class PdfCreateAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self._jinja_env = _build_jinja_env()

        self._meta_planner: Agent[None, DocumentMeta] = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(DocumentMeta),
            system_prompt=_META_PLANNER_SYSTEM_PROMPT,
            model_settings={**runtime.smart_model_settings, "temperature": 0.1},
        )

        self._sections_planner: Agent[None, DocumentSections] = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(DocumentSections),
            system_prompt=_SECTIONS_PLANNER_SYSTEM_PROMPT,
            model_settings={**runtime.smart_model_settings, "temperature": 0.1},
        )

        self._writer: Agent[None, WrittenSections] = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(WrittenSections),
            system_prompt=_WRITER_SYSTEM_PROMPT,
            model_settings={**runtime.smart_model_settings, "temperature": 0.3},
        )

    async def orchestrate(self, request: OrchestratorRequest) -> PdfCreateOrchestrateResponse:
        history = format_conversation_history(request.conversation_history)

        # ── Phase 1: plan meta ─────────────────────────────────────────────────
        logger.info("[pdf-create] phase 1/6: planning document meta")
        meta_prompt = f"Conversation history:\n{history}\n\nUser request: {request.user_message}"
        meta_result = await self._meta_planner.run(meta_prompt)
        meta = meta_result.output

        if meta.cannot_do_reason:
            logger.info("[pdf-create] cannot_do: %s", meta.cannot_do_reason)
            return EditCannotDoResponse(reason=meta.cannot_do_reason)

        logger.info("[pdf-create] meta: title=%r tone=%r", meta.title, meta.tone_brief)

        # ── Phase 2: plan sections ─────────────────────────────────────────────
        logger.info("[pdf-create] phase 2/6: planning sections")
        sections_prompt = _build_sections_prompt(meta, request.user_message, history)
        sections_result = await self._sections_planner.run(sections_prompt)
        planned_sections = sections_result.output

        if not planned_sections.sections:
            logger.info("[pdf-create] sections planner returned empty sections")
            return EditCannotDoResponse(reason="No document sections could be planned from the request.")

        plan = DocumentPlan.assemble(meta, planned_sections)

        # ── Phase 3: chunk ─────────────────────────────────────────────────────
        chunks = _make_chunks(plan.sections)
        logger.info(
            "[pdf-create] phase 3/6: chunked — sections=%d chunks=%d",
            len(plan.sections),
            len(chunks),
        )

        # ── Phase 4: write in parallel, bounded ────────────────────────────────
        logger.info("[pdf-create] phase 4/6: writing %d chunk(s) in parallel", len(chunks))
        total_chunks = len(chunks)
        semaphore = asyncio.Semaphore(_MAX_PARALLEL_WRITERS)
        written_chunks: list[WrittenSections] = await asyncio.gather(
            *[self._write_chunk(plan, chunk, total_chunks, semaphore) for chunk in chunks]
        )

        # ── Phase 5: assemble in plan order (gather preserves insertion order) ──
        all_sections: list[DocumentSection] = []
        for written in written_chunks:
            all_sections.extend(written.sections)

        logger.info("[pdf-create] phase 5/6: assembled %d sections", len(all_sections))

        doc = GeneratedDocument(
            title=plan.title,
            subtitle=plan.subtitle,
            reference_number=plan.reference_number,
            style=plan.style,
            sections=all_sections,
        )

        # ── Phase 6: render ────────────────────────────────────────────────────
        logger.info("[pdf-create] phase 6/6: rendering HTML")
        html = self._render(doc)
        filename = _safe_filename(plan.title)
        logger.info(
            "[pdf-create] done — filename=%r html_bytes=%d",
            filename,
            len(html),
        )

        return EditPlanResponse(
            summary=f"Created {plan.title}",
            steps=[
                ToolOperationStep(
                    tool=AgentToolId.CREATE_PDF_FROM_HTML_AGENT,
                    parameters=CreatePdfFromHtmlAgentParams(
                        html_content=html,
                        filename=filename,
                    ),
                )
            ],
        )

    async def _write_chunk(
        self, plan: DocumentPlan, chunk: _Chunk, total_chunks: int, semaphore: asyncio.Semaphore
    ) -> WrittenSections:
        async with semaphore:
            prompt = _build_writer_prompt(plan, chunk)
            result = await self._writer.run(prompt)
        logger.info(
            "[pdf-create] chunk %d/%d wrote %d sections",
            chunk.index + 1,
            total_chunks,
            len(result.output.sections),
        )
        return result.output

    def _render(self, doc: GeneratedDocument) -> str:
        template = self._jinja_env.get_template("document.html.jinja2")
        return template.render(doc=doc)
