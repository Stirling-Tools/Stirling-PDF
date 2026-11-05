"""The description each generated tool model carries into the planner catalogue."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "generate_tool_models.py"


@pytest.fixture(scope="module")
def generator() -> ModuleType:
    spec = importlib.util.spec_from_file_location("generate_tool_models", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_prefers_the_operation_description(generator: ModuleType) -> None:
    path_item = {"post": {"summary": "Repair a PDF file", "description": "Runs Ghostscript, then qpdf."}}
    assert generator._operation_description(path_item) == "Runs Ghostscript, then qpdf."


def test_falls_back_to_the_summary(generator: ModuleType) -> None:
    assert generator._operation_description({"post": {"summary": "Repair a PDF file"}}) == "Repair a PDF file"


def test_collapses_line_breaks_from_java_text_blocks(generator: ModuleType) -> None:
    path_item = {"post": {"description": "Splits a PDF\n by size,\n\n  then by count."}}
    assert generator._operation_description(path_item) == "Splits a PDF by size, then by count."


def test_has_no_description_without_an_operation_annotation(generator: ModuleType) -> None:
    assert generator._operation_description({"post": {}}) is None
