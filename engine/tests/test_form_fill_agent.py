from __future__ import annotations

import pytest

from stirling.agents import FormFillAgent
from stirling.config import AppSettings
from stirling.contracts.form_fill import (
    DetectedRole,
    FieldMapping,
    FormField,
    FormFillClarificationResponse,
    FormFillRequest,
    FormFillResultResponse,
    KnowledgeEntry,
    KnowledgeUpdateResponse,
    RoleConfirmationResponse,
    RoleDetectionResult,
)
from stirling.services import build_runtime


def build_test_settings() -> AppSettings:
    return AppSettings(
        smart_model_name="test",
        fast_model_name="test",
        smart_model_max_tokens=8192,
        fast_model_max_tokens=2048,
    )


class StubFormFillAgent(FormFillAgent):
    def __init__(
        self,
        fill_response: FormFillResultResponse | None = None,
        extraction_response: KnowledgeUpdateResponse | None = None,
    ) -> None:
        super().__init__(build_runtime(build_test_settings()))
        self._fill_response = fill_response
        self._extraction_response = extraction_response

    async def _run_fill_agent(self, request: FormFillRequest) -> FormFillResultResponse:
        assert self._fill_response is not None
        return self._fill_response

    async def _extract_knowledge(self, request: FormFillRequest) -> KnowledgeUpdateResponse:
        assert self._extraction_response is not None
        return self._extraction_response


@pytest.mark.anyio
async def test_form_fill_returns_clarification_when_no_fields_or_document() -> None:
    agent = FormFillAgent(build_runtime(build_test_settings()))

    response = await agent.handle(FormFillRequest(user_message="Fill this form"))

    assert isinstance(response, FormFillClarificationResponse)


@pytest.mark.anyio
async def test_form_fill_routes_to_fill_when_fields_provided() -> None:
    expected = FormFillResultResponse(
        filled_fields=[FieldMapping(field_name="name", knowledge_key="full_name", value="John Doe")],
        role_detection=RoleDetectionResult(
            detected_roles=[DetectedRole(role_label="Applicant", field_names=["name"], is_primary_person=True)],
            primary_role_label="Applicant",
            primary_confidence=1.0,
            confidence_reasoning="Single section form.",
        ),
        message="Filled 1 field.",
    )
    agent = StubFormFillAgent(fill_response=expected)

    response = await agent.handle(
        FormFillRequest(
            user_message="Fill this form",
            form_fields=[FormField(name="name", type="text", label="Full Name")],
            knowledge={"full_name": "John Doe"},
        )
    )

    assert isinstance(response, FormFillResultResponse)
    assert len(response.filled_fields) == 1
    assert response.filled_fields[0].value == "John Doe"


@pytest.mark.anyio
async def test_form_fill_routes_to_extraction_when_document_text_provided() -> None:
    expected = KnowledgeUpdateResponse(
        proposed_entries=[KnowledgeEntry(key="full_name", value="John Doe", source="extracted from CV")],
        message="Extracted 1 entry.",
    )
    agent = StubFormFillAgent(extraction_response=expected)

    response = await agent.handle(
        FormFillRequest(
            user_message="Extract my info",
            extracted_document_text="John Doe, Software Engineer, john@example.com",
        )
    )

    assert isinstance(response, KnowledgeUpdateResponse)
    assert len(response.proposed_entries) == 1
    assert response.proposed_entries[0].key == "full_name"


@pytest.mark.anyio
async def test_form_fill_returns_empty_filled_for_unknown_info() -> None:
    expected = FormFillResultResponse(
        filled_fields=[],
        role_detection=RoleDetectionResult(
            detected_roles=[DetectedRole(role_label="Applicant", field_names=["ssn"], is_primary_person=True)],
            primary_role_label="Applicant",
            primary_confidence=1.0,
            confidence_reasoning="Single section form.",
        ),
        message="Could not fill any fields.",
    )
    agent = StubFormFillAgent(fill_response=expected)

    response = await agent.handle(
        FormFillRequest(
            user_message="Fill this form",
            form_fields=[FormField(name="ssn", type="text", label="Social Security Number")],
            knowledge={},
        )
    )

    assert isinstance(response, FormFillResultResponse)
    assert len(response.filled_fields) == 0


@pytest.mark.anyio
async def test_form_fill_prefers_fill_when_both_fields_and_document_provided() -> None:
    expected = FormFillResultResponse(
        filled_fields=[FieldMapping(field_name="email", knowledge_key="email", value="john@example.com")],
        role_detection=RoleDetectionResult(
            detected_roles=[DetectedRole(role_label="Applicant", field_names=["email"], is_primary_person=True)],
            primary_role_label="Applicant",
            primary_confidence=1.0,
            confidence_reasoning="Single section form.",
        ),
        message="Filled 1 field.",
    )
    agent = StubFormFillAgent(fill_response=expected)

    response = await agent.handle(
        FormFillRequest(
            user_message="Fill this form",
            form_fields=[FormField(name="email", type="text", label="Email")],
            knowledge={"email": "john@example.com"},
            extracted_document_text="Some document text",
        )
    )

    assert isinstance(response, FormFillResultResponse)


@pytest.mark.anyio
async def test_low_confidence_returns_role_confirmation() -> None:
    expected = FormFillResultResponse(
        filled_fields=[FieldMapping(field_name="client_name", knowledge_key="full_name", value="John Doe")],
        role_detection=RoleDetectionResult(
            detected_roles=[
                DetectedRole(role_label="Client", field_names=["client_name"], is_primary_person=True),
                DetectedRole(role_label="Beneficiary", field_names=["beneficiary_name"], is_primary_person=False),
            ],
            primary_role_label="Client",
            primary_confidence=0.7,
            confidence_reasoning="Field prefixes suggest Client is primary.",
        ),
        message="Filled 1 field.",
    )
    agent = StubFormFillAgent(fill_response=expected)

    response = await agent.handle(
        FormFillRequest(
            user_message="Fill this form",
            form_fields=[
                FormField(name="client_name", type="text", label="Client Name"),
                FormField(name="beneficiary_name", type="text", label="Beneficiary Name"),
            ],
            knowledge={"full_name": "John Doe"},
        )
    )

    assert isinstance(response, RoleConfirmationResponse)
    assert response.suggested_primary == "Client"
    assert len(response.provisional_fills) == 1


@pytest.mark.anyio
async def test_preference_match_skips_confirmation() -> None:
    expected = FormFillResultResponse(
        filled_fields=[FieldMapping(field_name="client_name", knowledge_key="full_name", value="John Doe")],
        role_detection=RoleDetectionResult(
            detected_roles=[
                DetectedRole(role_label="Client", field_names=["client_name"], is_primary_person=True),
                DetectedRole(role_label="Beneficiary", field_names=["beneficiary_name"], is_primary_person=False),
            ],
            primary_role_label="Client",
            primary_confidence=0.7,
            confidence_reasoning="Field prefixes suggest Client is primary.",
        ),
        message="Filled 1 field.",
    )
    agent = StubFormFillAgent(fill_response=expected)

    response = await agent.handle(
        FormFillRequest(
            user_message="Fill this form",
            form_fields=[
                FormField(name="client_name", type="text", label="Client Name"),
                FormField(name="beneficiary_name", type="text", label="Beneficiary Name"),
            ],
            knowledge={"full_name": "John Doe", "_role_preference": "client"},
        )
    )

    # Preference matches "Client", so no confirmation needed
    assert isinstance(response, FormFillResultResponse)
