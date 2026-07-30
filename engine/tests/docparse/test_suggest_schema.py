from __future__ import annotations

import base64
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_suggest_schema_agent
from stirling.api.routes import docparse as docparse_routes
from stirling.contracts.docparse import (
    DocparseCapabilities,
    DocparseTier,
    SuggestedField,
    SuggestedFieldType,
    SuggestSchemaRequest,
    SuggestSchemaResponse,
)
from stirling.contracts.documents import PageText
from stirling.docparse.suggest_schema import _SuggestedField, _SuggestOutput, to_snake_case, validate_fields


def _force_addon(monkeypatch: pytest.MonkeyPatch, installed: bool) -> None:
    caps = DocparseCapabilities(advanced_installed=installed, models_available=installed)
    monkeypatch.setattr(docparse_routes, "probe_capabilities", lambda _home, refresh=False: caps)


class StubSuggestAgent:
    def __init__(self) -> None:
        self.seen_pages: list[PageText] | None = None

    async def suggest(
        self, _request: SuggestSchemaRequest, pages: list[PageText], tier: DocparseTier
    ) -> SuggestSchemaResponse:
        self.seen_pages = pages
        return SuggestSchemaResponse(
            mode=tier,
            fields=[SuggestedField(name="invoice_number", type=SuggestedFieldType.STRING, description="The number.")],
        )


@pytest.fixture
def stub_agent() -> StubSuggestAgent:
    return StubSuggestAgent()


@pytest.fixture
def client(stub_agent: StubSuggestAgent) -> Iterator[TestClient]:
    app.dependency_overrides[get_suggest_schema_agent] = lambda: stub_agent
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_suggest_schema_agent, None)


# ── validation (model proposes, code decides) ───────────────────────────


def _output(*fields: tuple[str, str]) -> _SuggestOutput:
    return _SuggestOutput(fields=[_SuggestedField(name=n, type=t, description="d") for n, t in fields])


def test_names_are_coerced_to_snake_case() -> None:
    fields = validate_fields(_output(("Invoice Number", "string"), ("dueDate", "string")), max_fields=8)
    assert [f.name for f in fields] == ["invoice_number", "due_date"]


def test_invalid_types_are_dropped() -> None:
    fields = validate_fields(_output(("total", "money"), ("count", "integer"), ("date", "datetime")), max_fields=8)
    assert [f.name for f in fields] == ["count"]
    assert fields[0].type is SuggestedFieldType.INTEGER


def test_duplicate_names_collapse_to_first() -> None:
    fields = validate_fields(_output(("total", "number"), ("Total", "string"), ("total", "integer")), max_fields=8)
    assert len(fields) == 1
    assert fields[0].type is SuggestedFieldType.NUMBER


def test_result_is_capped_at_max_fields() -> None:
    fields = validate_fields(_output(*[(f"field_{i}", "string") for i in range(10)]), max_fields=3)
    assert [f.name for f in fields] == ["field_0", "field_1", "field_2"]


def test_names_that_cannot_become_identifiers_are_dropped() -> None:
    fields = validate_fields(_output(("123abc", "string"), ("!!!", "string"), ("ok_name", "string")), max_fields=8)
    assert [f.name for f in fields] == ["ok_name"]


def test_snake_case_coercion_examples() -> None:
    assert to_snake_case("Invoice No.") == "invoice_no"
    assert to_snake_case("invoiceNumber") == "invoice_number"
    assert to_snake_case("TotalUSD") == "total_usd"
    assert to_snake_case("  already_snake ") == "already_snake"


# ── route ───────────────────────────────────────────────────────────────


def test_suggest_schema_basic_tier_from_pages(client: TestClient) -> None:
    response = client.post(
        "/api/v1/docparse/suggest-schema",
        json={"fileName": "invoice.pdf", "pages": [{"pageNumber": 1, "text": "Invoice INV-1"}]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "basic"
    assert body["fields"][0] == {"name": "invoice_number", "type": "string", "description": "The number."}


def test_suggest_schema_without_pages_or_content_is_422(client: TestClient) -> None:
    response = client.post("/api/v1/docparse/suggest-schema", json={"fileName": "x.pdf"})
    assert response.status_code == 422


def test_suggest_schema_content_without_addon_is_422(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _force_addon(monkeypatch, installed=False)
    payload = {"fileName": "scan.pdf", "contentBase64": base64.b64encode(b"%PDF-1.4").decode()}
    response = client.post("/api/v1/docparse/suggest-schema", json=payload)
    assert response.status_code == 422


def test_suggest_schema_rejects_max_fields_above_cap(client: TestClient) -> None:
    response = client.post(
        "/api/v1/docparse/suggest-schema",
        json={"fileName": "x.pdf", "pages": [{"pageNumber": 1, "text": "t"}], "maxFields": 21},
    )
    assert response.status_code == 422
