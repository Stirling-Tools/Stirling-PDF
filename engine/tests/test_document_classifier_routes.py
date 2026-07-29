from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from stirling.api import app
from stirling.api.dependencies import get_document_classifier_agent
from stirling.contracts import (
    ClassifyDocumentRequest,
    ClassifyDocumentResponse,
    ConsideredLabel,
    DocumentClassificationResponse,
    LabelAssignment,
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
        # The result is label ids (the model's name answers, mapped to ids).
        DocumentClassificationResponse(
            labels=["nda", "contract"],
            assignments=[
                LabelAssignment(label_id="nda", confidence=0.93),
                LabelAssignment(label_id="contract", confidence=0.71),
            ],
            considered=[ConsideredLabel(label_id="invoice", confidence=0.2, reason="mentions a fee schedule")],
        )
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_document_classifier_agent, None)


_LABELS = [{"id": "nda", "name": "NDA"}, {"id": "contract", "name": "Contract"}]


def test_classify_returns_assigned_labels(classification_client: TestClient) -> None:
    response = classification_client.post(
        "/api/v1/documents/classify",
        json={
            "fileName": "nda.pdf",
            "pages": [{"pageNumber": 1, "text": "Mutual NDA between A and B."}],
            "labels": _LABELS,
        },
    )
    assert response.status_code == 200
    assert response.json() == {
        "labels": ["nda", "contract"],
        "assignments": [
            {"labelId": "nda", "confidence": 0.93},
            {"labelId": "contract", "confidence": 0.71},
        ],
        "considered": [{"labelId": "invoice", "confidence": 0.2, "reason": "mentions a fee schedule"}],
    }


def test_classify_accepts_allowed_labels_on_the_request(classification_client: TestClient) -> None:
    response = classification_client.post(
        "/api/v1/documents/classify",
        json={
            "fileName": "nda.pdf",
            "pages": [],
            "labels": [
                {"id": "contract", "name": "Contract"},
                {"id": "invoice", "name": "Invoice"},
            ],
        },
    )
    assert response.status_code == 200


def test_classify_accepts_empty_pages(classification_client: TestClient) -> None:
    response = classification_client.post(
        "/api/v1/documents/classify",
        json={"fileName": "blank.pdf", "pages": [], "labels": _LABELS},
    )
    assert response.status_code == 200


def test_classify_rejects_empty_file_name(classification_client: TestClient) -> None:
    response = classification_client.post(
        "/api/v1/documents/classify",
        json={"fileName": "", "pages": [], "labels": _LABELS},
    )
    assert response.status_code == 422


def test_classify_rejects_missing_labels(classification_client: TestClient) -> None:
    # The backend always supplies the vocabulary; a request without one is invalid.
    response = classification_client.post(
        "/api/v1/documents/classify",
        json={"fileName": "nda.pdf", "pages": []},
    )
    assert response.status_code == 422
