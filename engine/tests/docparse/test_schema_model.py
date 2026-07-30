from __future__ import annotations

from typing import Any

import pytest

from stirling.docparse.extractor import MAX_SCHEMA_DEPTH, SchemaError, build_output_model, flatten_answers


def _schema(properties: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": properties}


def test_builds_scalar_fields() -> None:
    model = build_output_model(
        _schema(
            {
                "invoice_number": {"type": "string", "description": "The invoice id"},
                "total": {"type": "number"},
                "line_count": {"type": "integer"},
                "paid": {"type": "boolean"},
            }
        )
    )
    instance = model.model_validate(
        {
            "invoiceNumber": {"value": "INV-1", "quote": "Invoice INV-1", "confidence": 0.9},
            "total": {"value": 12.5, "quote": None, "confidence": 0.8},
            "lineCount": {"value": 3, "quote": None, "confidence": 0.7},
            "paid": {"value": True, "quote": None, "confidence": 0.6},
        }
    )
    leaves = dict((name, value) for name, value, _quote, _conf in flatten_answers(instance))
    assert leaves == {"invoice_number": "INV-1", "total": 12.5, "line_count": 3, "paid": True}


def test_nested_objects_flatten_to_dotted_names() -> None:
    model = build_output_model(_schema({"vendor": {"type": "object", "properties": {"name": {"type": "string"}}}}))
    instance = model.model_validate({"vendor": {"name": {"value": "ACME", "quote": None, "confidence": 0.5}}})
    names = [name for name, _v, _q, _c in flatten_answers(instance)]
    assert names == ["vendor.name"]


def test_arrays_of_scalars() -> None:
    model = build_output_model(_schema({"tags": {"type": "array", "items": {"type": "string"}}}))
    instance = model.model_validate({"tags": {"value": ["a", "b"], "quote": None, "confidence": 1.0}})
    leaves = flatten_answers(instance)
    assert leaves[0][1] == ["a", "b"]


def test_enum_lands_in_description_not_type() -> None:
    model = build_output_model(_schema({"currency": {"type": "string", "enum": ["EUR", "USD"]}}))
    answer_model = model.model_fields["currency"].annotation
    description = answer_model.model_fields["value"].description  # type: ignore[union-attr]
    assert "EUR" in description and "USD" in description


@pytest.mark.parametrize(
    "schema",
    [
        {"type": "object", "properties": {}},
        {"type": "object"},
        {"type": "object", "properties": {"bad-name": {"type": "string"}}},
        {"type": "object", "properties": {"x": {"type": "date"}}},
        {"type": "object", "properties": {"x": {"type": "array"}}},
        {"type": "object", "properties": {"x": {"type": "array", "items": {"type": "object"}}}},
    ],
)
def test_rejects_unsupported_schemas(schema: dict[str, Any]) -> None:
    with pytest.raises(SchemaError):
        build_output_model(schema)


def test_rejects_over_deep_nesting() -> None:
    schema: dict = {"type": "string"}
    for _ in range(MAX_SCHEMA_DEPTH + 2):
        schema = {"type": "object", "properties": {"child": schema}}
    with pytest.raises(SchemaError):
        build_output_model(schema)
