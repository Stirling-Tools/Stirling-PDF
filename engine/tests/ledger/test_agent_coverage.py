from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic_ai.exceptions import AgentRunError

from stirling.agents.ledger.agent import (
    ExtractedFigure,
    FigureExtractionResult,
    FormulaCheck,
    MathAuditorAgent,
    StatementCheck,
    StatementsResult,
    TableFormulas,
)
from stirling.contracts.ledger import Evidence, Folio, FolioManifest, FolioType, Requisition

# These tests replace the LLM agents with deterministic async doubles.
# pyright: reportArgumentType=false, reportAttributeAccessIssue=false


def _agent() -> MathAuditorAgent:
    agent = object.__new__(MathAuditorAgent)
    agent._llm_semaphore = __import__("asyncio").Semaphore(10)
    return agent


@pytest.mark.anyio
async def test_examine_forwards_manifest_to_examiner() -> None:
    agent = _agent()
    request = FolioManifest(session_id="session", page_count=1, folio_types=[FolioType.TEXT])
    expected = SimpleNamespace(output=Requisition(need_text=[0], rationale="text"))
    agent._examiner = SimpleNamespace(run=AsyncMock(return_value=expected))

    result = await agent.examine(request)

    assert result is expected.output
    agent._examiner.run.assert_awaited_once()


@pytest.mark.anyio
async def test_audit_processes_arithmetic_formulas_figures_and_statements() -> None:
    agent = _agent()
    agent._infer_formulas = AsyncMock(
        return_value=TableFormulas(
            formulas=[
                FormulaCheck(
                    description="total",
                    formula="col1 = col2 * col3",
                    scope="each_row",
                )
            ]
        )
    )
    agent._extract_figures_for_page = AsyncMock(
        return_value=[
            (ExtractedFigure(label="Revenue", value="100", raw="100"), 0),
            (ExtractedFigure(label="Bad", value="not numeric", raw="x"), 0),
        ]
    )
    agent._verify_statements = AsyncMock(
        return_value=StatementsResult(
            statements=[
                StatementCheck(
                    claim="claim",
                    verification="comparison",
                    expected_result="100",
                    actual_claim="200",
                    is_valid=False,
                    explanation="wrong",
                )
            ]
        )
    )
    agent._generate_summary = AsyncMock(return_value="summary")
    evidence = Evidence(
        session_id="session",
        round=2,
        final_round=True,
        unauditable_pages=[3],
        folios=[
            Folio(page=0, text="Revenue 100", tables=["Item,Total,Qty,Price\nA,99,2,3"]),
            Folio(page=1, text=" "),
        ],
    )

    verdict = await agent.audit(evidence)

    assert verdict.summary == "summary"
    assert verdict.pages_examined == [0, 1]
    assert verdict.unauditable_pages == [3]
    assert verdict.error_count >= 1
    agent._generate_summary.assert_awaited_once()


@pytest.mark.anyio
async def test_internal_llm_helpers_return_structured_outputs() -> None:
    agent = _agent()
    agent._table_analyser = SimpleNamespace(
        run=AsyncMock(return_value=SimpleNamespace(output=TableFormulas(formulas=[])))
    )
    agent._statement_verifier = SimpleNamespace(
        run=AsyncMock(return_value=SimpleNamespace(output=StatementsResult(statements=[])))
    )
    agent._figure_extractor = SimpleNamespace(
        run=AsyncMock(return_value=SimpleNamespace(output=FigureExtractionResult(figures=[])))
    )

    assert await agent._infer_formulas("a,b\n1,2") == TableFormulas(formulas=[])
    assert await agent._verify_statements(Folio(page=0, text="text", tables=["a,b\n1,2"])) == StatementsResult(
        statements=[]
    )
    assert await agent._verify_statements(Folio(page=0, text=" ")) == StatementsResult(statements=[])
    assert await agent._extract_figures_for_page(Folio(page=0, text="text")) == []
    assert await agent._extract_figures_for_page(Folio(page=0, text=" ")) == []


@pytest.mark.anyio
async def test_summary_and_throttle_helpers() -> None:
    agent = _agent()
    agent._summary_agent = SimpleNamespace(run=AsyncMock(return_value=SimpleNamespace(output="model summary")))
    discrepancy = SimpleNamespace(severity="warning", page=0, description="warning")
    result = await agent._generate_summary([discrepancy], [0], [1], "stats")
    assert result == "model summary"
    assert await agent._throttled(_value()) == "value"


@pytest.mark.anyio
async def test_audit_skips_failed_subtasks_and_summary_falls_back() -> None:
    agent = _agent()
    agent._infer_formulas = AsyncMock(return_value=TableFormulas(formulas=[]))
    agent._extract_figures_for_page = AsyncMock(side_effect=RuntimeError("figures failed"))
    agent._verify_statements = AsyncMock(side_effect=RuntimeError("statements failed"))
    agent._summary_agent = SimpleNamespace(run=AsyncMock(side_effect=AgentRunError("summary failed")))
    evidence = Evidence(
        session_id="session",
        round=1,
        folios=[Folio(page=0, text="text", tables=["a,b\n1,2"])],
    )

    verdict = await agent.audit(evidence)

    assert "No mathematical errors" in verdict.summary


@pytest.mark.anyio
async def test_agent_helpers_handle_provider_failures() -> None:
    agent = _agent()
    agent._table_analyser = SimpleNamespace(run=AsyncMock(side_effect=AgentRunError("formula failed")))
    agent._statement_verifier = SimpleNamespace(run=AsyncMock(side_effect=AgentRunError("statement failed")))
    agent._figure_extractor = SimpleNamespace(run=AsyncMock(side_effect=AgentRunError("figure failed")))

    assert await agent._infer_formulas("a,b\n1,2") == TableFormulas(formulas=[])
    assert await agent._verify_statements(Folio(page=0, text="text")) == StatementsResult(statements=[])
    assert await agent._extract_figures_for_page(Folio(page=0, text="text")) == []


async def _value() -> str:
    return "value"


def test_fallback_summary_covers_clean_error_warning_and_unauditable_cases() -> None:
    assert "No mathematical errors" in MathAuditorAgent._fallback_summary(0, 0, [0], [])
    assert MathAuditorAgent._fallback_summary(1, 0, [0], []) == "Found 1 error."
    assert MathAuditorAgent._fallback_summary(2, 1, [0], [1]).startswith("Found 2 errors. Found 1 warning.")
