"""Runs the shared cases in ``testing/tool-io-cases.json``.

The backend and the frontend run the same file against their own implementations, so a rule
that changes in one place and not the others fails here.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from stirling.models.tool_io import ToolFormat, ToolIOSpec
from stirling.models.tool_models import ToolEndpoint
from stirling.services.tool_io_compat import (
    ToolChainStep,
    ToolDiagnostic,
    validate_tool_chain,
)


def _cases_file() -> Path:
    """The fixture is shared with the backend and frontend, so it lives at the repo root."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "testing" / "tool-io-cases.json"
        if candidate.exists():
            return candidate
    raise RuntimeError("testing/tool-io-cases.json not found above the test directory")


_DATA: dict[str, Any] = json.loads(_cases_file().read_text())
_SPECS: dict[str, ToolIOSpec] = {name: ToolIOSpec.model_validate(spec) for name, spec in _DATA["specs"].items()}
_ENDPOINTS: list[ToolEndpoint] = list(ToolEndpoint)


def _summarise(diagnostics: list[ToolDiagnostic]) -> list[str]:
    """Compare on the parts that are contractual; messages are free text."""
    return [f"{d.step_index}:{d.severity}:{d.code}" for d in diagnostics]


@pytest.mark.parametrize("case", _DATA["cases"], ids=lambda c: c["name"])
def test_shared_cases(case: dict[str, Any]) -> None:
    table: dict[ToolEndpoint, ToolIOSpec] = {}
    steps: list[ToolChainStep] = []
    for index, step in enumerate(case["steps"]):
        # Distinct endpoints so the same spec can appear twice in a chain. Which ones is
        # irrelevant: the case supplies its own table, these are just keys.
        operation = _ENDPOINTS[index]
        if step.get("spec") is not None:
            table[operation] = _SPECS[step["spec"]]
        steps.append(ToolChainStep(operation=operation, parameters=step.get("parameters") or {}))

    source = case.get("sourceFormat")
    actual = validate_tool_chain(
        steps,
        source_format=ToolFormat(source) if source else None,
        tool_io=table,
    )

    expected = [f"{e['stepIndex']}:{e['severity']}:{e['code']}" for e in case["expected"]]
    assert _summarise(actual) == expected, [d.message for d in actual]
