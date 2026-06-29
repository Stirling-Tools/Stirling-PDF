from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_document_classifier_agent
from stirling.contracts import (
    ClassifyDocumentRequest,
    ClassifyDocumentResponse,
    DocumentClassificationResponse,
)


class StubClassifierAgent:
    """Stands in for DocumentClassifierAgent so route tests don't call a model."""

    def __init__(self, response: ClassifyDocumentResponse) -> None:
        self._response = response

    async def classify(self, _request: ClassifyDocumentRequest) -> ClassifyDocumentResponse:
        return self._response


@pytest.fixture
def classification_client() -> Iterator[TestClient]:
    app.dependency_overrides[get_document_classifier_agent] = lambda: StubClassifierAgent(
        DocumentClassificationResponse(
            category="contract", doc_type="nda", type_confidence=0.96, tags=["legal", "signed"]
        )
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_document_classifier_agent, None)


def test_classify_returns_camel_cased_result(classification_client: TestClient) -> None:
    response = classification_client.post(
        "/api/v1/documents/classify",
        json={"fileName": "nda.pdf", "pages": [{"pageNumber": 1, "text": "Mutual NDA between A and B."}]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["outcome"] == "classification"
    assert body["category"] == "contract"
    assert body["docType"] == "nda"
    assert body["typeConfidence"] == 0.96
    assert body["tags"] == ["legal", "signed"]


def test_classify_accepts_empty_pages(classification_client: TestClient) -> None:
    response = classification_client.post(
        "/api/v1/documents/classify",
        json={"fileName": "blank.pdf", "pages": []},
    )
    assert response.status_code == 200


def test_classify_rejects_empty_file_name(classification_client: TestClient) -> None:
    response = classification_client.post(
        "/api/v1/documents/classify",
        json={"fileName": "", "pages": []},
    )
    assert response.status_code == 422
