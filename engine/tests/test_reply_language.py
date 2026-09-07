from __future__ import annotations

from collections.abc import Iterator
from typing import Any, cast

import pytest

from stirling.agents import OrchestratorAgent
from stirling.agents.pdf_questions import PdfQuestionAgent
from stirling.contracts import (
    OrchestratorRequest,
    PdfQuestionAnswerResponse,
    PdfQuestionRequest,
    SupportedCapability,
)
from stirling.services import language_directive, set_reply_locale
from stirling.services.runtime import AppRuntime


@pytest.fixture(autouse=True)
def reset_locale() -> Iterator[None]:
    set_reply_locale(None)
    yield
    set_reply_locale(None)


def test_directive_falls_back_to_the_message_language() -> None:
    assert "same language as their message" in language_directive()


def test_directive_pins_the_bound_locale() -> None:
    set_reply_locale("fr-FR")
    assert "'fr-FR'" in language_directive()


def test_orchestrator_request_carries_the_locale() -> None:
    assert OrchestratorRequest.model_validate({"userMessage": "hi", "locale": "de-DE"}).locale == "de-DE"
    assert OrchestratorRequest.model_validate({"userMessage": "hi"}).locale is None


def test_question_prompt_carries_the_directive() -> None:
    set_reply_locale("es-ES")
    # _build_prompt ignores self, so call it off the class.
    prompt = PdfQuestionAgent._build_prompt(cast(Any, None), PdfQuestionRequest(question="¿Cuántas páginas?"))
    assert "'es-ES'" in prompt


@pytest.mark.anyio
async def test_handle_binds_the_locale_for_delegates(runtime: AppRuntime, monkeypatch: pytest.MonkeyPatch) -> None:
    """The resume path reaches a delegate with the request's locale already bound."""
    agent = OrchestratorAgent(runtime)
    seen: list[str] = []

    async def capture(request: OrchestratorRequest) -> PdfQuestionAnswerResponse:
        seen.append(language_directive())
        return PdfQuestionAnswerResponse(answer="ok")

    monkeypatch.setattr(agent, "_run_pdf_question", capture)
    await agent.handle(
        OrchestratorRequest(
            user_message="Combien de pages ?",
            locale="fr-FR",
            resume_with=SupportedCapability.PDF_QUESTION,
        )
    )
    assert "'fr-FR'" in seen[0]
