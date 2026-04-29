"""Tests for PDF to Markdown agent.

Three cases:
1. Narrative-only page: request validates and routes to reconstruction.
2. Mixed text + table page: layout with table region validates correctly.
3. Malformed parsed_tables (Algonquin-style column collapse) alongside valid page_layout:
   the request validates, parsed_table is below confidence threshold, layout has correct rows.
"""

from __future__ import annotations

from stirling.contracts.pdf_to_markdown import (
    LayoutFragment,
    LayoutLine,
    PageLayout,
    ParsedTable,
    PdfToMarkdownRequest,
    PdfToMarkdownSuccessResponse,
)


def _frag(text: str, x: float, y: float, font_size: float = 10.0, bold: bool = False) -> LayoutFragment:
    return LayoutFragment(text=text, x=x, y=y, width=float(len(text) * 6), font_size=font_size, bold=bold)


def _line(y: float, *frags: LayoutFragment) -> LayoutLine:
    return LayoutLine(y=y, fragments=list(frags))


# ── Test 1: Narrative-only reconstruction ────────────────────────────────────────────────────────


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


# ── Test 3: Malformed parsed_tables alongside valid page_layout ───────────────────────────────────


def test_malformed_parsed_table_with_valid_layout() -> None:
    """Algonquin-style: Tabula collapses all project names into one cell.

    The parsed_table has low confidence and a single collapsed cell.
    The page_layout has the correct word-level rows across two lines.
    The request validates cleanly; agent routing should prefer the layout.
    """
    collapsed_table = ParsedTable(
        table_id="tbl-p1-0",
        page_number=1,
        raw_rows=[
            # Tabula collapsed all project names into one cell
            ["Chaplin Wind 1 Amherst Island 2 Val Eo 1 Morse Wind 3, 4"],
            # and all locations into one cell
            ["Saskatchewan Ontario Quebec Saskatchewan"],
        ],
        column_count=1,
        confidence=0.3,
        warnings=["Inconsistent column count: modal=1 max=4"],
    )

    correct_layout = PageLayout(
        page_number=1,
        lines=[
            # Each visual row is a separate line in the layout
            _line(
                95.0,
                _frag("Chaplin Wind 1", x=72.0, y=95.0),
                _frag("Saskatchewan", x=200.0, y=95.0),
                _frag("177", x=310.0, y=95.0),
                _frag("$355.0", x=380.0, y=95.0),
            ),
            _line(
                110.0,
                _frag("Amherst Island 2", x=72.0, y=110.0),
                _frag("Ontario", x=200.0, y=110.0),
                _frag("75", x=310.0, y=110.0),
                _frag("$230.0", x=380.0, y=110.0),
            ),
            _line(
                125.0,
                _frag("Val Eo 1", x=72.0, y=125.0),
                _frag("Quebec", x=200.0, y=125.0),
                _frag("24", x=310.0, y=125.0),
                _frag("$70.0", x=380.0, y=125.0),
            ),
            _line(
                140.0,
                _frag("Morse Wind 3, 4", x=72.0, y=140.0),
                _frag("Saskatchewan", x=200.0, y=140.0),
                _frag("25", x=310.0, y=140.0),
                _frag("$70.0", x=380.0, y=140.0),
            ),
        ],
    )

    request = PdfToMarkdownRequest(
        user_message="reconstruct",
        parsed_tables=[collapsed_table],
        page_layout=[correct_layout],
    )

    # The collapsed table is below confidence threshold — agent should not use it as source of truth
    assert request.parsed_tables[0].confidence < 0.5

    # The layout has 4 separate rows (not 1 collapsed row)
    assert len(request.page_layout[0].lines) == 4

    # Each layout row has 4 fragments at consistent x-positions — the correct column structure
    for line in request.page_layout[0].lines:
        assert len(line.fragments) == 4
        xs = [f.x for f in line.fragments]
        assert xs == [72.0, 200.0, 310.0, 380.0]

    # The response type accepts a reconstruction outcome
    reconstruction = PdfToMarkdownSuccessResponse(
        markdown=(
            "| Project Name | Location | Size (MW) | Capital Cost |\n"
            "| --- | --- | ---: | ---: |\n"
            "| Chaplin Wind 1 | Saskatchewan | 177 | $355.0 |\n"
            "| Amherst Island 2 | Ontario | 75 | $230.0 |\n"
            "| Val Eo 1 | Quebec | 24 | $70.0 |\n"
            "| Morse Wind 3, 4 | Saskatchewan | 25 | $70.0 |\n"
        ),
    )
    assert reconstruction.outcome == "document_reconstructed"
    # Each project is a separate row — not collapsed into one cell
    assert "| Chaplin Wind 1 |" in reconstruction.markdown
    assert "| Amherst Island 2 |" in reconstruction.markdown
    assert "| Val Eo 1 |" in reconstruction.markdown
    assert "| Morse Wind 3, 4 |" in reconstruction.markdown
