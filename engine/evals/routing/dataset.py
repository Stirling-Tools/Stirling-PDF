"""Labelled routing cases for the orchestrator's top-level capability decision.

Each case is one user turn as the orchestrator sees it. ``expected`` is the correct
capability; ``tolerated`` lists routes that are defensible for genuinely ambiguous
turns and are scored as near-misses rather than failures.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

# Mirrors orchestrator._RouteCapability. Kept as plain strings so the eval can score a
# model that returns something off-menu without blowing up.
CAPABILITIES = ("pdf_edit", "pdf_question", "user_spec", "pdf_review", "pdf_create", "unsupported")


class Band(StrEnum):
    """Difficulty band, so accuracy is reported per band rather than as one blurred number."""

    CLEAR = "clear"
    BOUNDARY = "boundary"
    CONTEXTUAL = "contextual"
    ADVERSARIAL = "adversarial"


@dataclass(frozen=True)
class RoutingCase:
    id: str
    message: str
    expected: str
    band: Band
    files: tuple[str, ...] = ("document.pdf",)
    history: tuple[tuple[str, str], ...] = ()
    tolerated: frozenset[str] = frozenset()
    note: str = ""


def _c(
    id: str,
    message: str,
    expected: str,
    band: Band,
    *,
    files: tuple[str, ...] = ("document.pdf",),
    history: tuple[tuple[str, str], ...] = (),
    tolerated: frozenset[str] = frozenset(),
    note: str = "",
) -> RoutingCase:
    return RoutingCase(id, message, expected, band, files, history, tolerated, note)


# --- Clear questions: reading the document, nothing mutated -------------------------
_CLEAR_QUESTIONS = [
    _c("q-what-about", "What is this document about?", "pdf_question", Band.CLEAR),
    _c("q-who-signed", "Who signed this contract?", "pdf_question", Band.CLEAR),
    _c("q-total", "What is the total amount on this invoice?", "pdf_question", Band.CLEAR),
    _c("q-summarise", "Summarise this for me", "pdf_question", Band.CLEAR),
    _c("q-deadline", "When is the payment deadline?", "pdf_question", Band.CLEAR),
    _c("q-parties", "List the parties named in this agreement", "pdf_question", Band.CLEAR),
    _c("q-explain", "Explain clause 7 in plain English", "pdf_question", Band.CLEAR),
    _c("q-howmany-pages", "How many pages does this have?", "pdf_question", Band.CLEAR),
    _c("q-mention", "Does this mention anything about termination?", "pdf_question", Band.CLEAR),
    _c("q-language", "What language is this written in?", "pdf_question", Band.CLEAR),
]

# --- Clear edits: the user wants a changed file back --------------------------------
_CLEAR_EDITS = [
    _c("e-rotate", "Rotate all pages 90 degrees", "pdf_edit", Band.CLEAR),
    _c("e-to-word", "Convert this to Word", "pdf_edit", Band.CLEAR),
    _c("e-compress", "Compress this file, it is too big to email", "pdf_edit", Band.CLEAR),
    _c("e-split", "Split this into one file per page", "pdf_edit", Band.CLEAR),
    _c("e-merge", "Merge these two files together", "pdf_edit", Band.CLEAR, files=("a.pdf", "b.pdf")),
    _c("e-watermark", "Add a DRAFT watermark to every page", "pdf_edit", Band.CLEAR),
    _c("e-password", "Password protect this with hunter2", "pdf_edit", Band.CLEAR),
    _c("e-delete-p3", "Delete page 3", "pdf_edit", Band.CLEAR),
    _c("e-ocr", "Run OCR on this so I can search it", "pdf_edit", Band.CLEAR),
    _c("e-to-images", "Export every page as a PNG", "pdf_edit", Band.CLEAR),
]

# --- The reported failure mode: question vs edit on near-identical surface forms -----
_BOUNDARY = [
    _c(
        "b-blank-ask",
        "Are there any blank pages in this?",
        "pdf_question",
        Band.BOUNDARY,
        note="Asks whether, does not ask to remove.",
    ),
    _c("b-blank-do", "Remove the blank pages", "pdf_edit", Band.BOUNDARY),
    _c("b-signed-ask", "Is this document signed?", "pdf_question", Band.BOUNDARY),
    _c("b-signed-do", "Sign this document for me", "pdf_edit", Band.BOUNDARY),
    _c("b-pw-ask", "Is this file password protected?", "pdf_question", Band.BOUNDARY),
    _c("b-pw-do", "Remove the password from this file", "pdf_edit", Band.BOUNDARY),
    _c("b-pii-ask", "Does this contain any personal data?", "pdf_question", Band.BOUNDARY),
    _c("b-pii-do", "Redact all the personal data", "pdf_edit", Band.BOUNDARY),
    _c(
        "b-can-you-compress",
        "Can you compress this?",
        "pdf_edit",
        Band.BOUNDARY,
        note="Polite imperative, not a capability question.",
    ),
    _c(
        "b-how-much-smaller",
        "How much smaller could this file get?",
        "pdf_question",
        Band.BOUNDARY,
        tolerated=frozenset({"unsupported"}),
    ),
    _c("b-which-pages", "Which pages mention the budget?", "pdf_question", Band.BOUNDARY),
    _c("b-extract-pages", "Extract the pages that mention the budget", "pdf_edit", Band.BOUNDARY),
    _c("b-count-forms", "How many form fields are in this?", "pdf_question", Band.BOUNDARY),
    _c("b-flatten-forms", "Flatten the form fields", "pdf_edit", Band.BOUNDARY),
    _c("b-orientation-ask", "Are any pages upside down?", "pdf_question", Band.BOUNDARY),
    _c("b-orientation-do", "Fix the pages that are upside down", "pdf_edit", Band.BOUNDARY),
    _c(
        "b-should-i-split",
        "Should I split this into separate documents?",
        "pdf_question",
        Band.BOUNDARY,
        tolerated=frozenset({"unsupported"}),
        note="Advice, not an instruction.",
    ),
    _c("b-what-format", "What format is this file in?", "pdf_question", Band.BOUNDARY),
]

# --- Create a brand-new document, usually with no input file ------------------------
_CREATE = [
    _c("c-invoice", "Write me an invoice for 500 pounds of consulting work", "pdf_create", Band.CLEAR, files=()),
    _c("c-letter", "Draft a resignation letter", "pdf_create", Band.CLEAR, files=()),
    _c("c-report", "Create a one page status report about our Q3 launch", "pdf_create", Band.CLEAR, files=()),
    _c("c-contract", "Make me a simple freelance contract template", "pdf_create", Band.CLEAR, files=()),
    _c("c-nda", "Generate an NDA between Acme Ltd and Beta Inc", "pdf_create", Band.CLEAR, files=()),
    _c(
        "c-invoice-withfile",
        "Create an invoice like this one but for 900 pounds",
        "pdf_create",
        Band.BOUNDARY,
        tolerated=frozenset({"pdf_edit", "pdf_question"}),
        note="File present but the output is a new doc.",
    ),
    _c("c-cover", "Write a cover letter for a product manager role", "pdf_create", Band.CLEAR, files=()),
    _c("c-agenda", "Put together a meeting agenda for Thursday", "pdf_create", Band.CLEAR, files=()),
]

# --- Review: return the PDF with comments/annotations attached ----------------------
_REVIEW = [
    _c("r-review", "Review this and leave comments", "pdf_review", Band.CLEAR),
    _c("r-annotate", "Annotate anything unclear with sticky notes", "pdf_review", Band.CLEAR),
    _c("r-feedback", "Give me feedback on this draft as comments on the document", "pdf_review", Band.CLEAR),
    _c("r-flag", "Flag any risky clauses directly in the PDF", "pdf_review", Band.CLEAR),
    _c(
        "r-markup",
        "Mark up the sections that need work",
        "pdf_review",
        Band.BOUNDARY,
        tolerated=frozenset({"pdf_edit"}),
    ),
    _c(
        "r-whats-wrong",
        "What is wrong with this contract?",
        "pdf_question",
        Band.BOUNDARY,
        tolerated=frozenset({"pdf_review"}),
        note="Wants an answer, not an annotated file.",
    ),
    _c("r-proofread", "Proofread this and put your corrections in the margin", "pdf_review", Band.BOUNDARY),
]

# --- Agent spec authoring -----------------------------------------------------------
_SPEC = [
    _c("s-agent", "Create an agent that watermarks every file I upload", "user_spec", Band.CLEAR, files=()),
    _c("s-automation", "Set up an automation to compress incoming invoices", "user_spec", Band.CLEAR, files=()),
    _c("s-define", "Define a new agent for redacting client names", "user_spec", Band.CLEAR, files=()),
    _c(
        "s-workflow",
        "I want a workflow that OCRs and then splits by chapter",
        "user_spec",
        Band.BOUNDARY,
        tolerated=frozenset({"pdf_edit"}),
    ),
    _c("s-edit-spec", "Change my watermark agent to use red text", "user_spec", Band.CLEAR, files=()),
    _c("s-once", "Watermark this one file", "pdf_edit", Band.BOUNDARY, note="One-off action, not a reusable spec."),
]

# --- About the assistant, or out of scope -------------------------------------------
_UNSUPPORTED = [
    _c("u-model", "What model are you running on?", "unsupported", Band.CLEAR, files=()),
    _c("u-who", "Who made you?", "unsupported", Band.CLEAR, files=()),
    _c("u-capabilities", "What can you do?", "unsupported", Band.CLEAR, files=()),
    _c("u-weather", "What is the weather in London tomorrow?", "unsupported", Band.CLEAR, files=()),
    _c("u-code", "Write me a Python script to sort a list", "unsupported", Band.CLEAR, files=()),
    _c("u-hello", "hey", "unsupported", Band.CLEAR, files=()),
    _c("u-thanks", "thanks, that worked", "unsupported", Band.CLEAR, tolerated=frozenset({"pdf_question"})),
]

# --- Turns that only make sense against the conversation history ---------------------
_CONTEXTUAL = [
    _c(
        "x-do-it",
        "yes do that",
        "pdf_edit",
        Band.CONTEXTUAL,
        history=(
            ("user", "Can you compress this file?"),
            ("assistant", "I can compress it to about 40% of the current size. Shall I go ahead?"),
        ),
    ),
    _c(
        "x-and-page2",
        "and what about page 2?",
        "pdf_question",
        Band.CONTEXTUAL,
        history=(
            ("user", "What does page 1 say?"),
            ("assistant", "Page 1 is the cover sheet for the Acme service agreement."),
        ),
    ),
    _c(
        "x-now-rotate",
        "now rotate it",
        "pdf_edit",
        Band.CONTEXTUAL,
        history=(("user", "Split this into single pages"), ("assistant", "Done, I split it into 12 files.")),
    ),
    _c(
        "x-why",
        "why did you pick that one?",
        "unsupported",
        Band.CONTEXTUAL,
        tolerated=frozenset({"pdf_question"}),
        history=(("user", "Compress this"), ("assistant", "I used the lossless compression profile.")),
    ),
    _c(
        "x-same-again",
        "do the same to this one",
        "pdf_edit",
        Band.CONTEXTUAL,
        files=("second.pdf",),
        history=(("user", "Add a watermark saying CONFIDENTIAL"), ("assistant", "Watermark added.")),
    ),
    _c(
        "x-more-detail",
        "can you give me more detail on that?",
        "pdf_question",
        Band.CONTEXTUAL,
        history=(("user", "What are the payment terms?"), ("assistant", "Net 30 from invoice date.")),
    ),
]

# --- Phrasings built to trip a keyword-ish router -----------------------------------
_ADVERSARIAL = [
    _c(
        "a-word-question",
        "Does this document explain how to convert a PDF to Word?",
        "pdf_question",
        Band.ADVERSARIAL,
        note="Contains 'convert to Word' but is a content question.",
    ),
    _c(
        "a-merge-mention",
        "Which section talks about the merger?",
        "pdf_question",
        Band.ADVERSARIAL,
        note="'merger' is not the merge tool.",
    ),
    _c("a-split-mention", "What does it say about splitting the estate?", "pdf_question", Band.ADVERSARIAL),
    _c("a-rotate-mention", "Is there anything in here about staff rotation?", "pdf_question", Band.ADVERSARIAL),
    _c(
        "a-sign-mention", "What are the signature requirements described in clause 4?", "pdf_question", Band.ADVERSARIAL
    ),
    _c("a-compress-mention", "Does the report discuss compression algorithms?", "pdf_question", Band.ADVERSARIAL),
    _c(
        "a-polite-delete",
        "Could you please delete the last page?",
        "pdf_edit",
        Band.ADVERSARIAL,
        note="Question mark, but an instruction.",
    ),
    _c("a-polite-landscape", "I would really appreciate it if this were in landscape", "pdf_edit", Band.ADVERSARIAL),
    _c(
        "a-declarative-q",
        "I need to know who approved this",
        "pdf_question",
        Band.ADVERSARIAL,
        note="Declarative, but a question.",
    ),
    _c("a-redact-mention", "Explain the redaction policy described on page 6", "pdf_question", Band.ADVERSARIAL),
]

CASES: list[RoutingCase] = [
    *_CLEAR_QUESTIONS,
    *_CLEAR_EDITS,
    *_BOUNDARY,
    *_CREATE,
    *_REVIEW,
    *_SPEC,
    *_UNSUPPORTED,
    *_CONTEXTUAL,
    *_ADVERSARIAL,
]


def by_band() -> dict[Band, list[RoutingCase]]:
    grouped: dict[Band, list[RoutingCase]] = {band: [] for band in Band}
    for case in CASES:
        grouped[case.band].append(case)
    return grouped


# Misrouting a read-only turn into a mutating capability changes the user's file; the
# reverse merely answers. Scored separately so a strategy cannot win on raw accuracy
# while getting the dangerous direction wrong.
MUTATING = frozenset({"pdf_edit", "pdf_create", "pdf_review"})


def is_destructive_miss(case: RoutingCase, predicted: str) -> bool:
    return case.expected not in MUTATING and predicted in MUTATING and predicted not in case.tolerated
