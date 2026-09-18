"""Guards the evals against the shipping catalogue and against malformed model output.

The eval runners spend every model call before they touch their datasets' derived data, so a
dataset that disagrees with ``OPERATIONS`` or with ``_RouteCapability`` costs a whole run, as
does a response shape that reaches an unguarded ``.get``.
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any, get_args

import anyio
import httpx
import pytest
from planner.dataset import BANDS, CASES, PlannerCase, band_for
from planner.runner import PlannerObservation
from planner.runner import summarise as planner_summarise
from routing.client import CallResult, OllamaRouter
from routing.cost import measure_pipeline_stages
from routing.dataset import CAPABILITIES, RoutingCase
from routing.dataset import CASES as ROUTING_CASES
from routing.runner import Observation
from routing.runner import summarise as routing_summarise
from routing.strategies import _parse_capability

from stirling.agents.orchestrator import _RouteCapability
from stirling.models import OPERATIONS

_OPERATION_NAMES = {op.name for op in OPERATIONS}
_INDEX_OF = {op.name: index for index, op in enumerate(OPERATIONS)}


def test_bands_partition_the_catalogue() -> None:
    covered = [index for span in BANDS.values() for index in span]
    assert len(covered) == len(set(covered))
    assert set(covered) == set(range(len(OPERATIONS)))


@pytest.mark.parametrize("case", CASES, ids=lambda case: case.id)
def test_planner_case_resolves_and_lands_in_a_band(case: PlannerCase) -> None:
    assert case.expected in _OPERATION_NAMES
    assert case.also_ok <= _OPERATION_NAMES
    band_for(_INDEX_OF[case.expected])


def test_planner_case_ids_are_unique() -> None:
    ids = [case.id for case in CASES]
    assert len(ids) == len(set(ids))


def test_routing_capabilities_match_the_router() -> None:
    assert set(CAPABILITIES) == set(get_args(_RouteCapability))


@pytest.mark.parametrize("case", ROUTING_CASES, ids=lambda case: case.id)
def test_routing_case_expects_a_real_capability(case: RoutingCase) -> None:
    assert case.expected in CAPABILITIES
    assert set(case.tolerated) <= set(CAPABILITIES)


@pytest.mark.parametrize("content", ["[]", '"pdf_edit"', "3", "null"])
def test_parse_capability_rejects_non_object_json(content: str) -> None:
    result = CallResult(content, 0.1, 0, 0, 0, "stop")
    assert _parse_capability(result, list(CAPABILITIES)) == "__unparsable__"


@pytest.mark.parametrize("payload", [{}, {"choices": []}, {"choices": "nope"}, {"choices": [None]}])
def test_call_reports_missing_choices_instead_of_raising(payload: object) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    async def call() -> CallResult:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await OllamaRouter(client).call(
                "system", "user", response_format=None, max_tokens=16, temperature=0.0, thinking=False
            )

    result = anyio.run(call)
    assert result.finish_reason == "no-choices"
    assert result.error is not None


def _planner_row(strategy: str, case: PlannerCase, index: int) -> PlannerObservation:
    predicted = case.expected if index % 3 else "MERGE_PDFS"
    return PlannerObservation(
        strategy=strategy,
        case_id=case.id,
        expected=case.expected,
        predicted=predicted,
        correct=predicted == case.expected,
        expected_index=_INDEX_OF[case.expected],
        predicted_index=_INDEX_OF[predicted],
        band=band_for(_INDEX_OF[case.expected]),
        prompt_tokens_sent=5000 + index,
        prompt_tokens_reported=100,
        latency_s=0.5,
    )


def _routing_row(strategy: str, case: RoutingCase, repeat: int, index: int) -> Observation:
    predicted = case.expected if index % 3 else CAPABILITIES[index % len(CAPABILITIES)]
    return Observation(
        strategy=strategy,
        case_id=case.id,
        band=str(case.band),
        expected=case.expected,
        predicted=predicted,
        correct=predicted == case.expected,
        tolerated=False,
        destructive=False,
        failed=False,
        calls=1,
        input_tokens=100 + index,
        output_tokens=8,
        thinking_chars=0,
        latency_s=0.1 * index,
        repeat=repeat,
        errors=[],
    )


def _shuffled_within_strategy(rows: list[Any], seed: int) -> list[Any]:
    """Models ``asyncio.as_completed``: strategies still run in order, cases finish in any."""
    rng = random.Random(seed)
    out: list[Any] = []
    for strategy in dict.fromkeys(row.strategy for row in rows):
        block = [row for row in rows if row.strategy == strategy]
        rng.shuffle(block)
        out.extend(block)
    return out


def test_planner_summary_does_not_depend_on_completion_order() -> None:
    rows = [
        _planner_row(strategy, case, index) for strategy in ("prod", "shortlist") for index, case in enumerate(CASES)
    ]
    canonical = json.dumps(planner_summarise(rows))
    for seed in range(8):
        assert json.dumps(planner_summarise(_shuffled_within_strategy(rows, seed))) == canonical


def test_routing_summary_does_not_depend_on_completion_order() -> None:
    rows = [
        _routing_row(strategy, case, repeat, index)
        for strategy in ("prod_baseline", "shortlist")
        for repeat in range(2)
        for index, case in enumerate(ROUTING_CASES)
    ]
    canonical = json.dumps(routing_summarise(rows))
    for seed in range(8):
        assert json.dumps(routing_summarise(_shuffled_within_strategy(rows, seed))) == canonical


_COUNTED_NOUN = re.compile(r"(\d+)[- ](?:operation|endpoint)s?\b")
_EVALS_DIR = Path(__file__).resolve().parents[1] / "evals"


@pytest.mark.parametrize(
    "path",
    sorted(p for p in _EVALS_DIR.rglob("*") if p.suffix in {".py", ".md"} and "__pycache__" not in p.parts),
    ids=lambda path: str(path.relative_to(_EVALS_DIR)),
)
def test_documented_catalogue_size_matches_the_catalogue(path: Path) -> None:
    """Prose and f-strings both quote the catalogue size; neither may outlive a new endpoint."""
    quoted = {int(match) for match in _COUNTED_NOUN.findall(path.read_text(encoding="utf-8"))}
    assert quoted <= {len(OPERATIONS)}


def test_cost_stage_notes_are_derived_from_the_live_catalogue() -> None:
    notes = " ".join(stage.note for stage in measure_pipeline_stages())
    assert f"{len(OPERATIONS)}-operation" in notes
    assert f"{len(get_args(_RouteCapability))}-way" in notes


_BAND_LABEL = re.compile(r"\((\d+)-(\d+),")


@pytest.mark.parametrize("label,span", sorted(BANDS.items()))
def test_band_label_matches_its_span(label: str, span: range) -> None:
    match = _BAND_LABEL.search(label)
    assert match is not None
    assert (int(match.group(1)), int(match.group(2))) == (span.start, span.stop - 1)
