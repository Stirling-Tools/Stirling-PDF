"""Every AI-selectable operation must describe itself in the planner prompt."""

from __future__ import annotations

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
