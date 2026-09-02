"""Labelled tool-selection cases for the pdf_edit planner.

Each case is a request that one operation answers. ``expected`` is that operation's
``ToolEndpoint`` name; ``also_ok`` holds operations that genuinely satisfy the request too.

Cases carry the expected operation's index in ``OPERATIONS`` so accuracy can be reported by
catalogue position. Ollama drops the head of an over-long prompt, and the menu is rendered
in ``OPERATIONS`` order, so an early operation loses its description while a late one keeps
it. Position is therefore a variable under test, not a curiosity.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PlannerCase:
    id: str
    message: str
    expected: str
    also_ok: frozenset[str] = frozenset()


def _p(id: str, message: str, expected: str, also_ok: frozenset[str] = frozenset()) -> PlannerCase:
    return PlannerCase(id, message, expected, also_ok)


# Conversions - indexes 0-25, the front of the catalogue and the first thing truncation eats.
_CONVERSIONS = [
    _p("to-word", "Turn this into an editable Word document", "PDF_TO_WORD"),
    _p("to-excel", "I need this as a spreadsheet I can sort", "PDF_TO_XLSX", frozenset({"PDF_TO_CSV"})),
    _p("to-images", "Save every page as a separate PNG", "PDF_TO_IMG"),
    _p("to-text", "Give me the plain text out of this", "PDF_TO_TEXT"),
    _p("to-pdfa", "Make this archival standard compliant for our records", "PDF_TO_PDFA"),
    _p("to-html", "Convert this into a web page", "PDF_TO_HTML"),
    _p("to-markdown", "I want this as markdown for our docs repo", "PDF_TO_MARKDOWN"),
    _p("to-epub", "Turn this into an ebook I can read on my Kindle", "PDF_TO_EPUB"),
    _p("to-slides", "Make this into a slide deck", "PDF_TO_PRESENTATION"),
    _p("from-images", "Combine these photos into one PDF", "IMG_TO_PDF"),
    _p("from-url", "Save this web address as a PDF", "URL_TO_PDF"),
    _p("to-accessible", "Make this compliant for screen reader users", "PDF_TO_UA"),
]

# Page-level structure - indexes 26-42, the middle of the catalogue.
_STRUCTURE = [
    _p("merge", "Join these two files into one", "MERGE_PDFS"),
    _p("split-pages", "Break this into one file per page", "SPLIT_PAGES"),
    _p("split-size", "Split this so no file is bigger than 5MB", "SPLIT_BY_SIZE_OR_COUNT"),
    _p("split-chapters", "Separate this book out by chapter", "SPLIT_PDF_BY_CHAPTERS"),
    _p("rotate", "Turn every page ninety degrees clockwise", "ROTATE_PDF"),
    _p("remove-pages", "Get rid of pages 4 through 9", "REMOVE_PAGES"),
    _p("rearrange", "Put the pages in reverse order", "REARRANGE_PAGES"),
    _p("crop", "Trim the white margins off every page", "CROP"),
    _p("nup", "Print this four pages to a sheet", "MULTI_PAGE_LAYOUT"),
    _p("booklet", "Lay this out as a folded booklet for printing", "BOOKLET_IMPOSITION"),
    _p("edit-text", "Change the word Draft to Final throughout", "EDIT_TEXT"),
    _p("scale", "Resize every page to A4", "SCALE_PAGES"),
]

# Content operations - indexes 43-62.
_CONTENT = [
    _p("compress", "Shrink this down, it is too big to email", "COMPRESS_PDF"),
    _p("ocr", "Make this scan searchable", "OCR_PDF"),
    _p("page-numbers", "Number the pages at the bottom", "ADD_PAGE_NUMBERS"),
    _p("stamp", "Put our logo in the top corner of each page", "ADD_STAMP"),
    _p("flatten", "Make the form fields non-editable", "FLATTEN"),
    _p("remove-blanks", "Strip out the empty pages", "REMOVE_BLANKS"),
    _p("extract-images", "Pull out all the pictures in this", "EXTRACT_IMAGES"),
    _p("attachments", "Get the files attached to this PDF", "EXTRACT_ATTACHMENTS"),
    _p("metadata", "Change the author name in the document properties", "UPDATE_METADATA"),
    _p("repair", "This file is corrupted, can you fix it", "REPAIR"),
    _p("auto-rotate", "Some pages are sideways, straighten them out", "AUTO_ROTATE_PDF"),
    _p("scanner", "Make this look like it came off a scanner", "SCANNER_EFFECT"),
]

# Security and reporting - indexes 63-72, the tail that always survives truncation.
_SECURITY = [
    _p("password", "Lock this with the password hunter2", "ADD_PASSWORD"),
    _p("remove-password", "Take the password off this file", "REMOVE_PASSWORD"),
    _p("watermark", "Put DRAFT across every page", "ADD_WATERMARK"),
    _p("redact", "Black out every mention of the client name", "REDACT_EXECUTE"),
    _p("sanitize", "Strip any embedded scripts out of this", "SANITIZE_PDF"),
    _p("unsign", "Remove the digital signature from this", "REMOVE_CERT_SIGN"),
    _p("timestamp", "Add a trusted timestamp to this document", "TIMESTAMP_PDF"),
    _p("a11y-report", "Check this against accessibility rules and report back", "ACCESSIBILITY_REPORT"),
]

CASES: list[PlannerCase] = [*_CONVERSIONS, *_STRUCTURE, *_CONTENT, *_SECURITY]


# Catalogue bands, by position in OPERATIONS. Named rather than computed so a reordering of
# the enum shows up as a failing assertion instead of silently changing what is measured.
BANDS: dict[str, range] = {
    "front (0-25, conversions)": range(0, 26),
    "middle (26-42, structure)": range(26, 43),
    "back (43-62, content)": range(43, 63),
    "tail (63-72, security)": range(63, 73),
}


def band_for(index: int) -> str:
    for name, span in BANDS.items():
        if index in span:
            return name
    raise ValueError(f"index {index} is outside every band")
