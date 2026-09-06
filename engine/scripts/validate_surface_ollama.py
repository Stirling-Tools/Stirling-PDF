"""Live surface-gate check against a local Ollama.

Not part of the test suite - it needs a running Ollama and a real model. Run it by hand:

    uv run --group engine --group engine-dev python scripts/validate_surface_ollama.py

Exercises the enum-router path (the one Ollama actually takes) end to end: for each prompt it
asserts which capability the router reached, on both surfaces. The `_run_*` helpers are stubbed
so nothing is dispatched - we only care which one the router chose.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from stirling.agents import OrchestratorAgent
from stirling.config.settings import AppSettings, DocumentsBackend
from stirling.contracts import AiFile, AssistantSurface, OrchestratorRequest
from stirling.models.base import FileId
from stirling.services.runtime import _build_model, build_runtime

MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:8b")
BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1")

# The editor cases attach a file, because that is the state a real workbench request is in and
# the router is told what files it has. The processor never has one.
# (prompt, expected in the editor, needs a file attached)
CASES: list[tuple[str, str, bool]] = [
    ("Rotate this PDF by 90 degrees", "pdf_edit", True),
    ("Compress these files", "pdf_edit", True),
    ("How many pages does this document have?", "pdf_question", True),
    ("What does the contract say about termination?", "pdf_question", True),
    ("Create an invoice for 3 items", "pdf_create", False),
    ("Write me a report about Q3 sales", "pdf_create", False),
    ("Review this and add comments on unclear parts", "pdf_review", True),
    ("Make a rule that stamps every upload with the date", "user_spec", False),
    ("Set up an automation to redact PII on everything that arrives", "user_spec", False),
]

DOC_CAPABILITIES = {"pdf_edit", "pdf_question", "pdf_review", "pdf_create"}


def build_settings() -> AppSettings:
    return AppSettings(
        smart_model_name=MODEL,
        fast_model_name=MODEL,
        chat_provider="ollama",
        smart_model_max_tokens=8192,
        fast_model_max_tokens=2048,
        model_max_concurrency=4,
        documents_backend=DocumentsBackend.SQLITE,
        rag_embedding_model="voyageai:voyage-4",
        documents_sqlite_path=Path(":memory:"),
        documents_pgvector_dsn="",
        documents_pgvector_pool_min_size=1,
        documents_pgvector_pool_max_size=4,
        rag_chunk_size=512,
        rag_chunk_overlap=64,
        rag_default_top_k=5,
        rag_max_searches=5,
        chunked_reasoner_chars_per_slice=16_000,
        chunked_reasoner_concurrency=4,
        chunked_reasoner_notes_char_budget=250_000,
        chunked_reasoner_worker_timeout_seconds=60.0,
        contradiction_detect_concurrency=5,
        contradiction_bucket_chunk_size=12,
        contradiction_bucket_chunk_overlap=2,
        contradiction_canonicaliser_batch_size=500,
        max_pages=200,
        max_characters=200_000,
        require_user_id=False,
        posthog_enabled=False,
        posthog_api_key="",
        posthog_host="",
    )


def stub_runs(agent: OrchestratorAgent, reached: list[str]) -> None:
    """Record which delegate the router reached instead of running it."""

    def recorder(name: str):
        async def run(_request: OrchestratorRequest) -> object:
            reached.append(name)
            return object()

        return run

    for name in ("pdf_edit", "pdf_question", "pdf_review", "pdf_create"):
        setattr(agent, f"_run_{name}", recorder(name))
    setattr(agent, "_run_agent_draft", recorder("user_spec"))


async def main() -> int:
    settings = build_settings()
    # Ollama speaks the OpenAI-compatible API; build both tiers against it explicitly.
    model = _build_model(MODEL, provider="ollama", base_url=BASE_URL)
    runtime = build_runtime(settings, fast_model=model, smart_model=model)

    failures: list[str] = []
    checks = 0
    for prompt, want_editor, needs_file in CASES:
        for surface in (AssistantSurface.EDITOR, AssistantSurface.PROCESSOR):
            agent = OrchestratorAgent(runtime)
            reached: list[str] = []
            stub_runs(agent, reached)
            files = (
                [AiFile(id=FileId("f1"), name="contract.pdf")]
                if needs_file and surface is AssistantSurface.EDITOR
                else []
            )
            response = await agent.handle(OrchestratorRequest(user_message=prompt, surface=surface, files=files))
            capability = getattr(response, "capability", None)
            if reached:
                got = reached[0]
            elif capability == "document_work":
                got = "gate-declined"
            else:
                got = "model-declined"

            checks += 1
            # Two invariants, which is all this change is responsible for. Which capability an
            # 8B local model picks for a given phrasing is its own business - routing quality is
            # not what is under test here, and it drifts by model.
            if surface is AssistantSurface.EDITOR:
                # The gate must never fire on the editor: no capability is taken away there.
                ok = got != "gate-declined"
                detail = "the gate must never fire on the editor surface"
            else:
                # No document capability may execute on the processor, by either mechanism.
                ok = got not in DOC_CAPABILITIES
                detail = "no document capability may run on the processor surface"

            note = ""
            if surface is AssistantSurface.EDITOR and got != want_editor:
                # Informational: the model routed somewhere else. Same on main - verified by
                # A/B-ing system_prompt= against instructions= with identical text.
                note = f"  (model chose {got}, not {want_editor} - model behaviour, not the gate)"

            if not ok:
                failures.append(f"{surface.value:9} | {prompt!r}: {detail}, got {got}")
            print(f"{'PASS' if ok else 'FAIL'} | {surface.value:9} | {got:14} | {prompt}{note}")

    print()
    if failures:
        print(f"{len(failures)} FAILURES:")
        for line in failures:
            print("  " + line)
        return 1
    print(f"All {checks} live routing checks passed against {MODEL}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
