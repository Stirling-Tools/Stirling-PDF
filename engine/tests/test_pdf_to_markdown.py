"""Tests for PDF to Markdown agent.

Two cases:
1. Narrative-only page: request validates and routes to reconstruction.
2. Mixed text + table page: layout with table region validates correctly.
"""

from __future__ import annotations

from stirling.contracts.pdf_to_markdown import (
    LayoutFragment,
    LayoutLine,
    PageLayout,
    PageLayoutArtifact,
    PdfToMarkdownRequest,
    PdfToMarkdownSuccessResponse,
)


def _frag(text: str, x: float, y: float, font_size: float = 10.0, bold: bool = False) -> LayoutFragment:
    return LayoutFragment(text=text, x=x, y=y, width=float(len(text) * 6), font_size=font_size, bold=bold)


def _line(y: float, *frags: LayoutFragment) -> LayoutLine:
    return LayoutLine(y=y, fragments=list(frags))


# ── Test 1: Narrative-only reconstruction ────────────────────────────────────────────────────────


# ── Contract test: Java serialization ↔ Python deserialization ──────────────────────────────────
# This JSON is also asserted field-by-field in PageLayoutArtifactContractTest.java.
# If either side renames a field, one of these tests fails.
_CONTRACT_JSON = (
    '{"kind":"page_layout","files":[{"fileName":"test.pdf","pages":'
    '[{"pageNumber":1,"lines":[{"y":10.0,"fragments":'
    '[{"text":"Hello","x":1.0,"y":2.0,"width":30.0,"fontSize":12.0,"bold":true}]}]}]}]}'
)


def test_page_layout_artifact_deserialises_java_json() -> None:
    artifact = PageLayoutArtifact.model_validate_json(_CONTRACT_JSON)

    assert artifact.kind == "page_layout"
    assert artifact.files[0].file_name == "test.pdf"
    page = artifact.files[0].pages[0]
    assert page.page_number == 1
    line = page.lines[0]
    assert line.y == 10.0
    frag = line.fragments[0]
    assert frag.text == "Hello"
    assert frag.x == 1.0
    assert frag.y == 2.0
    assert frag.width == 30.0
    assert frag.font_size == 12.0
    assert frag.bold is True


def test_narrative_reconstruction_request_validates() -> None:
    """A prose-only page with no tables produces a valid PdfToMarkdownRequest."""
    layout = PageLayout(
        page_number=1,
        lines=[
            _line(72.0, _frag("Annual Report 2023", x=72.0, y=72.0, font_size=18.0, bold=True)),
            _line(100.0, _frag("Our revenue grew significantly", x=72.0, y=100.0)),
            _line(114.0, _frag("during the fiscal year ended", x=72.0, y=114.0)),
            _line(128.0, _frag("December 31, 2023.", x=72.0, y=128.0)),
        ],
    )
    request = PdfToMarkdownRequest(
        user_message="reconstruct this document",
        page_layout=[layout],
    )

    assert len(request.page_layout) == 1
    assert len(request.page_layout[0].lines) == 4
    assert request.page_layout[0].lines[0].fragments[0].bold is True
    assert request.page_layout[0].lines[0].fragments[0].font_size == 18.0


def test_narrative_reconstruction_response_validates() -> None:
    """PdfToMarkdownSuccessResponse accepts markdown and returns document_reconstructed outcome."""
    response = PdfToMarkdownSuccessResponse(
        markdown="# Annual Report 2023\n\nOur revenue grew significantly during the fiscal year.",
    )

    assert response.outcome == "document_reconstructed"
    assert response.markdown.startswith("#")


# ── Test 2: Mixed text + table reconstruction ─────────────────────────────────────────────────────


def test_mixed_page_layout_validates() -> None:
    """A page with both prose lines and a table region produces a valid request."""
    layout = PageLayout(
        page_number=1,
        lines=[
            # Prose heading
            _line(50.0, _frag("Projects in Development", x=72.0, y=50.0, font_size=14.0, bold=True)),
            # Table header row
            _line(
                80.0,
                _frag("Project Name", x=72.0, y=80.0, bold=True),
                _frag("Location", x=200.0, y=80.0, bold=True),
                _frag("Size (MW)", x=290.0, y=80.0, bold=True),
            ),
            # Table data rows
            _line(
                95.0,
                _frag("Chaplin Wind 1", x=72.0, y=95.0),
                _frag("Saskatchewan", x=200.0, y=95.0),
                _frag("177", x=290.0, y=95.0),
            ),
            _line(
                110.0,
                _frag("Amherst Island 2", x=72.0, y=110.0),
                _frag("Ontario", x=200.0, y=110.0),
                _frag("75", x=290.0, y=110.0),
            ),
            # Prose after table
            _line(140.0, _frag("Notes:", x=72.0, y=140.0, bold=True)),
            _line(154.0, _frag("1 PPA signed", x=85.0, y=154.0)),
        ],
    )
    request = PdfToMarkdownRequest(
        user_message="markdown",
        page_layout=[layout],
    )

    assert len(request.page_layout[0].lines) == 6
    # Header line has 3 fragments at distinct x-positions (column detection)
    header_line = request.page_layout[0].lines[1]
    xs = [f.x for f in header_line.fragments]
    assert xs == [72.0, 200.0, 290.0]
    # Data rows have matching x-positions
    data_row = request.page_layout[0].lines[2]
    assert [f.x for f in data_row.fragments] == [72.0, 200.0, 290.0]
