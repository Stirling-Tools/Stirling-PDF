"""Tests for the chunked PdfCreateAgent pipeline.

Coverage:
1. Section model validation (each section type round-trips correctly)
2. Jinja rendering (_render produces valid HTML for each section type)
3. _safe_filename produces clean slugs
4. _make_chunks groups sections correctly by token budget
5. orchestrate() produces the correct EditPlanResponse via planner + writer mocks
6. orchestrate() returns EditCannotDoResponse when meta planner signals cannot_do
7. orchestrate() returns EditCannotDoResponse when sections planner returns empty list
"""

from __future__ import annotations

import pytest
from conftest import build_app_settings
from pydantic_ai.models.test import TestModel
from pydantic_ai.profiles import ModelProfile

from stirling.agents.pdf_create.agent import (
    PdfCreateAgent,
    _make_chunks,
    _safe_filename,
)
from stirling.contracts import (
    EditCannotDoResponse,
    EditPlanResponse,
    OrchestratorRequest,
)
from stirling.contracts.pdf_create import (
    BulletListSection,
    DocumentMeta,
    DocumentSections,
    DocumentStyle,
    GeneratedDocument,
    KeyValueSection,
    LineItemsSection,
    PlannedSection,
    SectionDepth,
    SectionType,
    SignatureSection,
    TextSection,
    WrittenSections,
)
from stirling.models.agent_tool_models import AgentToolId, CreatePdfFromHtmlAgentParams
from stirling.services import build_runtime
from stirling.services.runtime import AppRuntime

_NATIVE_PROFILE = ModelProfile(supports_json_schema_output=True)

# ── Fixtures ──────────────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def runtime() -> AppRuntime:
    return build_runtime(build_app_settings())


@pytest.fixture
def agent(runtime: AppRuntime) -> PdfCreateAgent:
    return PdfCreateAgent(runtime)


# ── Helpers ───────────────────────────────────────────────────────────────────────────────────────


def _invoice_doc() -> GeneratedDocument:
    return GeneratedDocument(
        title="Invoice",
        subtitle="Acme Corp",
        reference_number="Invoice #INV-001",
        sections=[
            KeyValueSection(
                heading="Details",
                pairs=[("Date", "2026-05-06"), ("Due", "2026-06-06"), ("Currency", "USD")],
            ),
            LineItemsSection(
                heading="Line Items",
                columns=["Description", "Qty", "Unit Price", "Total"],
                rows=[
                    ["Consulting services", "10", "$500.00", "$5,000.00"],
                    ["Expenses", "1", "$200.00", "$200.00"],
                ],
                total_row=["Total", "", "", "$5,200.00"],
            ),
            TextSection(
                heading="Payment Terms",
                body="Payment is due within 30 days.\n\nPlease reference the invoice number.",
            ),
            SignatureSection(
                heading="Authorised By",
                signatories=["Jane Smith, CEO", "Bob Jones, CFO"],
            ),
        ],
    )


def _simple_meta() -> DocumentMeta:
    return DocumentMeta(
        title="Invoice",
        subtitle="Acme Corp",
        tone_brief="Professional business tone.",
        shared_terms={"the Client": "Acme Corp"},
    )


def _simple_sections() -> DocumentSections:
    return DocumentSections(
        sections=[
            PlannedSection(
                heading="Details",
                type=SectionType.KEY_VALUE,
                depth=SectionDepth.BRIEF,
                key_points=["Date: 2026-05-06", "Due: 2026-06-06"],
            ),
            PlannedSection(
                heading="Line Items",
                type=SectionType.LINE_ITEMS,
                depth=SectionDepth.STANDARD,
                key_points=["Consulting services, 10h, $500/h", "Expenses, $200"],
            ),
        ]
    )


def _written_sections() -> WrittenSections:
    return WrittenSections(
        sections=[
            KeyValueSection(
                heading="Details",
                pairs=[("Date", "2026-05-06"), ("Due", "2026-06-06")],
            ),
            LineItemsSection(
                heading="Line Items",
                columns=["Description", "Qty", "Unit Price", "Total"],
                rows=[["Consulting services", "10", "$500.00", "$5,000.00"]],
                total_row=["Total", "", "", "$5,000.00"],
            ),
        ]
    )


def _orchestrator_request(message: str = "Create an invoice for Acme Corp") -> OrchestratorRequest:
    return OrchestratorRequest(
        user_message=message,
        files=[],
        conversation_history=[],
        artifacts=[],
        enabled_endpoints=[],
    )


# ── Section model validation ──────────────────────────────────────────────────────────────────────


def test_text_section_round_trips() -> None:
    s = TextSection(heading="Summary", body="Hello\n\nWorld")
    assert s.type == "text"
    assert s.heading == "Summary"
    assert "World" in s.body


def test_key_value_section_round_trips() -> None:
    s = KeyValueSection(pairs=[("Name", "Alice"), ("Role", "Engineer")])
    assert s.type == "key_value"
    assert s.pairs[0] == ("Name", "Alice")


def test_line_items_section_with_total_row() -> None:
    s = LineItemsSection(
        columns=["Item", "Amount"],
        rows=[["Widget", "$10"]],
        total_row=["Total", "$10"],
    )
    assert s.total_row is not None
    assert s.total_row[1] == "$10"


def test_line_items_section_optional_total_row() -> None:
    s = LineItemsSection(columns=["Item", "Amount"], rows=[["Widget", "$10"]])
    assert s.total_row is None


def test_bullet_list_section_round_trips() -> None:
    s = BulletListSection(items=["Alpha", "Beta", "Gamma"])
    assert s.type == "bullet_list"
    assert len(s.items) == 3


def test_signature_section_round_trips() -> None:
    s = SignatureSection(signatories=["Alice", "Bob"])
    assert s.type == "signature"
    assert "Alice" in s.signatories


def test_generated_document_optional_fields() -> None:
    doc = GeneratedDocument(title="Simple Doc", sections=[TextSection(body="Hello")])
    assert doc.subtitle is None
    assert doc.reference_number is None


# ── Jinja rendering ───────────────────────────────────────────────────────────────────────────────


def test_render_produces_html(agent: PdfCreateAgent) -> None:
    doc = _invoice_doc()
    html = agent._render(doc)
    assert "<!DOCTYPE html>" in html
    assert "Invoice" in html
    assert "INV-001" in html


def test_render_includes_all_section_types(agent: PdfCreateAgent) -> None:
    doc = GeneratedDocument(
        title="All Sections",
        sections=[
            TextSection(body="Some prose text."),
            KeyValueSection(pairs=[("Key", "Value")]),
            LineItemsSection(columns=["A", "B"], rows=[["1", "2"]]),
            BulletListSection(items=["item one"]),
            SignatureSection(signatories=["Alice"]),
        ],
    )
    html = agent._render(doc)
    assert "Some prose text." in html
    assert "Key" in html and "Value" in html
    assert "<th>" in html
    assert "item one" in html
    assert "Alice" in html


def test_render_escapes_html_in_content(agent: PdfCreateAgent) -> None:
    doc = GeneratedDocument(
        title="XSS Test",
        sections=[TextSection(body="<script>alert('xss')</script>")],
    )
    html = agent._render(doc)
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_render_total_row_present(agent: PdfCreateAgent) -> None:
    doc = GeneratedDocument(
        title="Table",
        sections=[
            LineItemsSection(
                columns=["Item", "Total"],
                rows=[["Widget", "$10"]],
                total_row=["Total", "$10"],
            )
        ],
    )
    html = agent._render(doc)
    assert "total-row" in html


def test_render_no_total_row_skips_tfoot(agent: PdfCreateAgent) -> None:
    doc = GeneratedDocument(
        title="Table",
        sections=[LineItemsSection(columns=["Item"], rows=[["Widget"]])],
    )
    html = agent._render(doc)
    assert "<tfoot>" not in html


def test_render_subtitle_and_reference(agent: PdfCreateAgent) -> None:
    doc = GeneratedDocument(
        title="My Doc",
        subtitle="Subtitle Here",
        reference_number="REF-42",
        sections=[TextSection(body="Content.")],
    )
    html = agent._render(doc)
    assert "Subtitle Here" in html
    assert "REF-42" in html


# ── _safe_filename ────────────────────────────────────────────────────────────────────────────────


def test_safe_filename_basic() -> None:
    assert _safe_filename("My Invoice") == "my-invoice.pdf"


def test_safe_filename_strips_special_chars() -> None:
    assert _safe_filename("Report: Q1/2026!") == "report-q12026.pdf"


def test_safe_filename_empty_title() -> None:
    assert _safe_filename("!!!") == "document.pdf"


# ── _make_chunks ──────────────────────────────────────────────────────────────────────────────────


def _planned(heading: str, depth: SectionDepth) -> PlannedSection:
    return PlannedSection(
        heading=heading,
        type=SectionType.TEXT,
        depth=depth,
        key_points=["placeholder"],
    )


def test_make_chunks_empty_returns_empty() -> None:
    assert _make_chunks([]) == []


def test_make_chunks_single_section_is_one_chunk() -> None:
    chunks = _make_chunks([_planned("Intro", SectionDepth.STANDARD)])
    assert len(chunks) == 1
    assert chunks[0].index == 0
    assert len(chunks[0].sections) == 1
    assert chunks[0].context_before is None
    assert chunks[0].context_after is None


def test_make_chunks_groups_under_ceiling() -> None:
    # 5 × STANDARD (550 each) = 2750 — fits in one chunk under ceiling of 3000
    sections = [_planned(f"Section {i}", SectionDepth.STANDARD) for i in range(5)]
    chunks = _make_chunks(sections)
    assert len(chunks) == 1
    assert len(chunks[0].sections) == 5


def test_make_chunks_splits_when_over_ceiling() -> None:
    # 6 × STANDARD (550 each) = 3300 — must split (3000 ceiling)
    # First chunk: 5 sections (2750), second: 1 section (550)
    sections = [_planned(f"Section {i}", SectionDepth.STANDARD) for i in range(6)]
    chunks = _make_chunks(sections)
    assert len(chunks) == 2
    assert len(chunks[0].sections) == 5
    assert len(chunks[1].sections) == 1


def test_make_chunks_oversized_section_gets_own_chunk() -> None:
    # DETAILED (1200) + 3×STANDARD (1650) = 2850; adding a 4th STANDARD (550) = 3400 > 3000.
    # So first chunk holds DETAILED + 3 STANDARDs; last STANDARD spills to chunk 2.
    sections = [
        _planned("Big Table", SectionDepth.DETAILED),
        _planned("Terms", SectionDepth.STANDARD),
        _planned("Notes", SectionDepth.STANDARD),
        _planned("Extra", SectionDepth.STANDARD),
        _planned("Appendix", SectionDepth.STANDARD),
    ]
    chunks = _make_chunks(sections)
    assert len(chunks) == 2
    assert chunks[0].sections[0].heading == "Big Table"
    assert len(chunks[0].sections) == 4
    assert chunks[1].sections[0].heading == "Appendix"


def test_make_chunks_neighbour_context() -> None:
    # 6 × STANDARD (550 each) = 3300 → splits into chunk of 5 (2750) + chunk of 1 (550)
    many = [_planned(f"S{i}", SectionDepth.STANDARD) for i in range(5)]
    many.append(_planned("Last", SectionDepth.STANDARD))
    chunks = _make_chunks(many)
    assert len(chunks) == 2
    assert chunks[0].context_after is not None
    assert chunks[1].context_before is not None
    assert chunks[0].context_before is None
    assert chunks[1].context_after is None


def test_make_chunks_preserves_section_order() -> None:
    headings = [f"Section {i}" for i in range(8)]
    sections = [_planned(h, SectionDepth.STANDARD) for h in headings]
    chunks = _make_chunks(sections)
    reassembled = [s.heading for chunk in chunks for s in chunk.sections]
    assert reassembled == headings


# ── orchestrate() ─────────────────────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_orchestrate_returns_plan_step(agent: PdfCreateAgent) -> None:
    meta = _simple_meta()
    sections = _simple_sections()
    written = _written_sections()

    with (
        agent._meta_planner.override(
            model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=meta.model_dump_json())
        ),
        agent._sections_planner.override(
            model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=sections.model_dump_json())
        ),
        agent._writer.override(model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=written.model_dump_json())),
    ):
        result = await agent.orchestrate(_orchestrator_request())

    assert isinstance(result, EditPlanResponse)
    assert len(result.steps) == 1
    step = result.steps[0]
    assert step.tool == AgentToolId.CREATE_PDF_FROM_HTML_AGENT
    assert isinstance(step.parameters, CreatePdfFromHtmlAgentParams)
    assert step.parameters.filename.endswith(".pdf")
    assert "<!DOCTYPE html>" in step.parameters.html_content
    assert "Invoice" in step.parameters.html_content


@pytest.mark.anyio
async def test_orchestrate_cannot_do_from_planner(agent: PdfCreateAgent) -> None:
    cannot_do_meta = DocumentMeta(cannot_do_reason="This is not a document creation request.")

    with agent._meta_planner.override(
        model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=cannot_do_meta.model_dump_json())
    ):
        result = await agent.orchestrate(_orchestrator_request("what is 2+2?"))

    assert isinstance(result, EditCannotDoResponse)
    assert "not a document" in result.reason


@pytest.mark.anyio
async def test_orchestrate_empty_sections_returns_cannot_do(agent: PdfCreateAgent) -> None:
    meta = DocumentMeta(title="Empty", tone_brief=".")
    empty_sections = DocumentSections(sections=[])

    with (
        agent._meta_planner.override(
            model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=meta.model_dump_json())
        ),
        agent._sections_planner.override(
            model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=empty_sections.model_dump_json())
        ),
    ):
        result = await agent.orchestrate(_orchestrator_request("do the thing"))

    assert isinstance(result, EditCannotDoResponse)


@pytest.mark.anyio
async def test_orchestrate_assembles_multiple_chunks(agent: PdfCreateAgent) -> None:
    """Two chunks of written sections are assembled in order into one document."""
    meta = DocumentMeta(title="Multi-Chunk Doc", tone_brief="Formal.")
    sections = DocumentSections(
        sections=[
            PlannedSection(heading="Intro", type=SectionType.TEXT, depth=SectionDepth.BRIEF, key_points=["x"]),
            PlannedSection(
                heading="Details",
                type=SectionType.KEY_VALUE,
                depth=SectionDepth.BRIEF,
                key_points=["y"],
            ),
        ]
    )
    # The writer override is shared across all parallel calls, so use a combined
    # WrittenSections that contains all sections — both chunks will return the same
    # payload and we verify the final HTML contains the expected content.
    combined = WrittenSections(
        sections=[
            TextSection(heading="Intro", body="Introduction text."),
            KeyValueSection(heading="Details", pairs=[("Key", "Value")]),
        ]
    )

    with (
        agent._meta_planner.override(
            model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=meta.model_dump_json())
        ),
        agent._sections_planner.override(
            model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=sections.model_dump_json())
        ),
        agent._writer.override(model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=combined.model_dump_json())),
    ):
        result = await agent.orchestrate(_orchestrator_request("Create a multi-chunk doc"))

    assert isinstance(result, EditPlanResponse)
    html = result.steps[0].parameters.html_content  # type: ignore[union-attr]
    assert "Introduction text." in html
    assert "Details" in html


# ── Style inference ───────────────────────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_orchestrate_applies_planner_inferred_style(agent: PdfCreateAgent) -> None:
    """Style extracted by the meta planner is applied to the rendered HTML."""
    meta = DocumentMeta(
        title="Styled Doc",
        tone_brief="Professional.",
        style_primary_color="magenta",
    )
    sections = _simple_sections()
    written = _written_sections()

    with (
        agent._meta_planner.override(
            model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=meta.model_dump_json())
        ),
        agent._sections_planner.override(
            model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=sections.model_dump_json())
        ),
        agent._writer.override(model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=written.model_dump_json())),
    ):
        result = await agent.orchestrate(_orchestrator_request("Make an invoice, magenta styling"))

    assert isinstance(result, EditPlanResponse)
    html = result.steps[0].parameters.html_content  # type: ignore[union-attr]
    assert "magenta" in html


def test_render_applies_style(agent: PdfCreateAgent) -> None:
    """DocumentStyle fields are injected as CSS custom properties in the rendered HTML."""
    doc = GeneratedDocument(
        title="Styled",
        sections=[TextSection(body="Content.")],
        style=DocumentStyle(primary_color="magenta", background_color="#111111"),
    )
    html = agent._render(doc)
    assert "--color-primary: magenta" in html
    assert "--color-bg: #111111" in html


def test_document_style_drops_unsafe_colors() -> None:
    """Unsafe colours (not named/hex) are dropped, closing the <style> url() injection."""
    safe = DocumentStyle(primary_color="navy", background_color="#1e3a5f", body_text_color="#fff")
    assert (safe.primary_color, safe.background_color, safe.body_text_color) == (
        "navy",
        "#1e3a5f",
        "#fff",
    )

    unsafe = DocumentStyle(
        primary_color="red; background: url(http://evil.test/steal)",
        background_color="expression(alert(1))",
        body_text_color="navy; }",
    )
    assert unsafe.primary_color is None
    assert unsafe.background_color is None
    assert unsafe.body_text_color is None
    # A trailing newline must not slip a value through (fullmatch, not $-before-newline).
    assert DocumentStyle(primary_color="navy\n").primary_color is None


@pytest.mark.anyio
async def test_orchestrate_drops_unsafe_planner_color(agent: PdfCreateAgent) -> None:
    """An unsafe colour inferred by the meta planner never reaches the rendered HTML."""
    meta = DocumentMeta(
        title="Doc",
        tone_brief="Professional.",
        style_primary_color="blue; background: url(http://evil.test/)",
    )
    sections = _simple_sections()
    written = _written_sections()

    with (
        agent._meta_planner.override(
            model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=meta.model_dump_json())
        ),
        agent._sections_planner.override(
            model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=sections.model_dump_json())
        ),
        agent._writer.override(model=TestModel(profile=_NATIVE_PROFILE, custom_output_text=written.model_dump_json())),
    ):
        result = await agent.orchestrate(_orchestrator_request("make it blue"))

    assert isinstance(result, EditPlanResponse)
    html = result.steps[0].parameters.html_content  # type: ignore[union-attr]
    assert "evil.test" not in html
    assert "url(" not in html
