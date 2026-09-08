"""Every AI-selectable operation must describe itself in the planner prompt."""

from __future__ import annotations

from collections import defaultdict

import pytest

from stirling.models import OPERATIONS, ToolEndpoint


def _description(endpoint: ToolEndpoint) -> str:
    return (OPERATIONS[endpoint].model_json_schema().get("description") or "").strip()


@pytest.mark.parametrize("endpoint", list(OPERATIONS), ids=lambda e: e.name)
def test_operation_has_a_description(endpoint: ToolEndpoint) -> None:
    assert _description(endpoint), (
        f"{endpoint.name} ({endpoint.value}) has no description. Add @Operation(summary=..., "
        "description=...) to the Java controller method and regenerate with 'task engine:tool-models'."
    )


@pytest.mark.parametrize("endpoint", list(OPERATIONS), ids=lambda e: e.name)
def test_description_is_not_just_the_endpoint_name(endpoint: ToolEndpoint) -> None:
    description = _description(endpoint)
    if not description:
        pytest.skip("covered by test_operation_has_a_description")
    normalised = description.lower().replace("-", " ").replace("_", " ").strip(" .")
    assert normalised != endpoint.name.lower().replace("_", " "), (
        f"{endpoint.name} description restates its own name: {description!r}"
    )


@pytest.mark.parametrize("endpoint", list(OPERATIONS), ids=lambda e: e.name)
def test_description_is_a_single_line(endpoint: ToolEndpoint) -> None:
    description = _description(endpoint)
    assert description == " ".join(description.split()), (
        f"{endpoint.name} description carries raw line breaks from the Java text block: {description!r}"
    )


def test_descriptions_are_mutually_distinct() -> None:
    by_description: dict[str, list[str]] = defaultdict(list)
    for endpoint in OPERATIONS:
        by_description[_description(endpoint)].append(endpoint.name)
    shared = {text: names for text, names in by_description.items() if len(names) > 1}
    assert not shared, "Operations sharing a description are indistinguishable to the planner: " + "; ".join(
        f"{', '.join(names)} all say {text!r}" for text, names in shared.items()
    )
