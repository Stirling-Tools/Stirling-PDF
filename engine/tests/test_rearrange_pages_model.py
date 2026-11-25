"""Contract tests for the generated RearrangePages request model."""

from __future__ import annotations

from stirling.models.tool_models import CustomMode, RearrangePagesParams


def test_custom_mode_exposes_odd_even_merge() -> None:
    """The rearrange-pages mode added for issue #6729 is expressible in the SDK."""
    assert CustomMode.odd_even_merge.value == "ODD_EVEN_MERGE"


def test_rearrange_pages_params_round_trips_odd_even_merge() -> None:
    """A params object with ODD_EVEN_MERGE serializes to the wire field customMode."""
    params = RearrangePagesParams(custom_mode=CustomMode.odd_even_merge, page_numbers="all")
    assert params.custom_mode == CustomMode.odd_even_merge
    assert params.model_dump()["customMode"] == "ODD_EVEN_MERGE"
