"""Live routing eval. Skipped unless STIRLING_ROUTING_EVAL is set, so CI stays offline.

Routing quality is a property of the model, not of the wiring, and it cannot be faked: the
test fixtures resolve the model name to pydantic-ai's TestModel, which always picks the FIRST
declared output tool - a stubbed routing test would assert pdf_edit forever and pass. So this
suite talks to a real provider, and the offline guards in
tests/agents/test_orchestrator_routing_surface.py cover everything that does not need one.

Ollama is the default target because chat_provider="ollama" is the enum-router path, which has
no other coverage at all. It is also the harshest judge: a 7B model routes on surface area, so
a prompt that survives here is not relying on a large model to paper over an unbalanced arm.

    ollama serve
    STIRLING_ROUTING_EVAL=1 uv run --locked --group engine --group engine-dev pytest tests/evals -q

Override the model with STIRLING_ROUTING_EVAL_MODEL, the endpoint with
STIRLING_ROUTING_EVAL_BASE_URL, and the repeat count with STIRLING_ROUTING_EVAL_RUNS.
"""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest

from stirling.agents.orchestrator import OrchestratorAgent
from stirling.contracts import AiFile, OrchestratorRequest
from stirling.models import FileId
from stirling.services import build_runtime
from stirling.services.runtime import AppRuntime, _build_model
from tests.conftest import build_app_settings

live_only = pytest.mark.skipif(
    not os.environ.get("STIRLING_ROUTING_EVAL"),
    reason="set STIRLING_ROUTING_EVAL=1 (and run a provider) to exercise live routing",
)

MODEL = os.environ.get("STIRLING_ROUTING_EVAL_MODEL", "qwen2.5:7b")
BASE_URL = os.environ.get("STIRLING_ROUTING_EVAL_BASE_URL", "http://localhost:11434/v1")
# Five, not three: a small model's error rate on a solid case sits around one in nine, and
# three samples let a single bad draw flip the majority and report a regression that is not there.
RUNS = int(os.environ.get("STIRLING_ROUTING_EVAL_RUNS", "5"))

# capability -> the orchestrator method that serves it. Patched to record-and-return so the
# eval measures the decision rather than paying for the work behind it.
_RUN_METHOD = {
    "pdf_edit": "_run_pdf_edit",
    "pdf_question": "_run_pdf_question",
    "user_spec": "_run_agent_draft",
    "pdf_review": "_run_pdf_review",
    "pdf_create": "_run_pdf_create",
}

# (id, message, attached file names, accepted capabilities). A set with more than one member
# is a genuinely ambiguous prompt - encoding a coin flip as a single truth makes the suite lie.
CASES = [
    # Product questions with no file. Before the docs work these fell to `unsupported`.
    ("docs-sso", "How do I set up SSO?", [], {"pdf_question"}),
    ("docs-ocr", "How do I turn on OCR?", [], {"pdf_question"}),
    ("docs-install", "How do I install Stirling PDF with Docker?", [], {"pdf_question"}),
    ("docs-settings", "What does the compression level setting do?", [], {"pdf_question"}),
    ("docs-with-file", "What does compression level 5 do?", ["report.pdf"], {"pdf_question"}),
    # The neighbours a product question is most likely to steal from.
    ("create-invoice", "Write me an invoice for Acme Ltd for 3 days of consulting", [], {"pdf_create"}),
    ("create-letter", "Draft a cover letter for a software job", [], {"pdf_create"}),
    ("spec", "Create an agent spec that watermarks every scan", [], {"user_spec"}),
    ("spec-ocr", "Define an agent that OCRs every incoming invoice", [], {"user_spec"}),
    # Unchanged behaviour that a prompt edit can silently break.
    ("edit-rotate", "Rotate this 90 degrees", ["scan.pdf"], {"pdf_edit"}),
    ("edit-merge", "Merge these two files into one", ["a.pdf", "b.pdf"], {"pdf_edit"}),
    ("edit-compress", "Compress this to under 2MB", ["big.pdf"], {"pdf_edit"}),
    ("question-contents", "What is the total on the invoice?", ["invoice.pdf"], {"pdf_question"}),
    # Instruction-shaped but answered with text, not a file.
    ("question-summary", "Summarise this document", ["report.pdf"], {"pdf_question"}),
    ("review", "Review this and leave comments on anything unclear", ["draft.pdf"], {"pdf_review"}),
    ("ambig-howto-file", "How do I rotate this?", ["scan.pdf"], {"pdf_edit", "pdf_question"}),
]


@pytest.fixture(scope="module")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="module")
def live_runtime() -> AppRuntime:
    settings = build_app_settings().model_copy(update={"chat_provider": "ollama"})
    model = _build_model(MODEL, provider="ollama", base_url=BASE_URL)
    return build_runtime(settings, fast_model=model, smart_model=model)


async def _route(runtime: AppRuntime, message: str, file_names: list[str]) -> str:
    orchestrator = OrchestratorAgent(runtime)
    files = [AiFile(id=FileId(f"id-{name}"), name=name) for name in file_names]
    chosen: list[str] = []
    patches = [
        patch.object(orchestrator, method, AsyncMock(side_effect=lambda *a, _c=cap, **k: chosen.append(_c)))
        for cap, method in _RUN_METHOD.items()
    ]
    for started in patches:
        started.start()
    try:
        await orchestrator.handle(OrchestratorRequest(user_message=message, files=files))
    finally:
        for started in patches:
            started.stop()
    # The enum path answers "unsupported" inline rather than through a delegate.
    return chosen[0] if chosen else "unsupported"


@live_only
@pytest.mark.anyio
@pytest.mark.parametrize(("case_id", "message", "files", "accepted"), CASES, ids=[c[0] for c in CASES])
async def test_routes_to_an_accepted_capability(
    live_runtime: AppRuntime,
    case_id: str,
    message: str,
    files: list[str],
    accepted: set[str],
) -> None:
    """Majority vote over RUNS. A router that is right once in three is not right - boundary
    prompts fail by wobbling, and a single-shot assertion hides exactly that."""
    results = [await _route(live_runtime, message, files) for _ in range(RUNS)]
    hits = sum(result in accepted for result in results)
    assert hits > RUNS // 2, f"{case_id}: {results} (accepted: {sorted(accepted)})"
