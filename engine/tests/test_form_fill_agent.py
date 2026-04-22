"""Tests for the form fill agents (analyser, filler, document extractor)."""

from __future__ import annotations

import pytest
from conftest import build_app_settings

from stirling.agents import DocumentExtractorAgent, FormAnalyserAgent, FormFillerAgent
from stirling.contracts.form_fill import (
    AnalysedFileResult,
    CrossFileRole,
    DetectedRole,
    DocumentExtractionRequest,
    DocumentExtractionResponse,
    DocumentText,
    FieldMapping,
    FileFieldSet,
    FileFillRequest,
    FileFillResult,
    FormAnalysisRequest,
    FormAnalysisResponse,
    FormField,
    FormFillBatchRequest,
    FormFillBatchResponse,
    KnowledgeEntry,
    KnowledgeUpdateResponse,
    MultiProfileExtractionResponse,
    ProposedProfile,
)
from stirling.services import build_runtime

# --- FormAnalyserAgent stubs ---


class StubFormAnalyserAgent(FormAnalyserAgent):
    def __init__(self, response: FormAnalysisResponse) -> None:
        super().__init__(build_runtime(build_app_settings()))
        self._response = response

    async def analyse(self, request: FormAnalysisRequest) -> FormAnalysisResponse:
        return self._response


# --- FormFillerAgent stubs ---


class StubFormFillerAgent(FormFillerAgent):
    def __init__(self, response: FormFillBatchResponse) -> None:
        super().__init__(build_runtime(build_app_settings()))
        self._response = response

    async def fill_batch(self, request: FormFillBatchRequest) -> FormFillBatchResponse:
        return self._response


# --- DocumentExtractorAgent stubs ---


class StubDocumentExtractorAgent(DocumentExtractorAgent):
    def __init__(self, response: DocumentExtractionResponse) -> None:
        super().__init__(build_runtime(build_app_settings()))
        self._response = response

    async def extract_multiple(self, request: DocumentExtractionRequest) -> DocumentExtractionResponse:
        return self._response


# --- Tests ---


@pytest.mark.anyio
async def test_analyser_returns_roles_for_single_file() -> None:
    expected = FormAnalysisResponse(
        per_file=[
            AnalysedFileResult(
                file_id="f1",
                file_name="form.pdf",
                detected_roles=[
                    DetectedRole(role_label="Client", field_names=["name", "email"], is_primary_person=True),
                    DetectedRole(role_label="Beneficiary", field_names=["ben_name"], is_primary_person=False),
                ],
            )
        ],
        cross_file_roles=[
            CrossFileRole(
                role_label="Client",
                file_ids=["f1"],
                field_names_by_file={"f1": ["name", "email"]},
                is_primary_person=True,
            ),
            CrossFileRole(
                role_label="Beneficiary",
                file_ids=["f1"],
                field_names_by_file={"f1": ["ben_name"]},
                is_primary_person=False,
            ),
        ],
        message="Found 2 roles.",
    )
    agent = StubFormAnalyserAgent(expected)

    result = await agent.analyse(
        FormAnalysisRequest(
            files=[
                FileFieldSet(
                    file_id="f1",
                    file_name="form.pdf",
                    form_fields=[
                        FormField(name="name", type="text", label="Full Name"),
                        FormField(name="email", type="text", label="Email"),
                        FormField(name="ben_name", type="text", label="Beneficiary Name"),
                    ],
                )
            ]
        )
    )

    assert len(result.cross_file_roles) == 2
    assert result.cross_file_roles[0].is_primary_person


@pytest.mark.anyio
async def test_analyser_merges_roles_across_files() -> None:
    expected = FormAnalysisResponse(
        per_file=[
            AnalysedFileResult(
                file_id="f1",
                file_name="a.pdf",
                detected_roles=[
                    DetectedRole(role_label="Client", field_names=["name"], is_primary_person=True),
                ],
            ),
            AnalysedFileResult(
                file_id="f2",
                file_name="b.pdf",
                detected_roles=[
                    DetectedRole(role_label="Applicant", field_names=["applicant_name"], is_primary_person=True),
                ],
            ),
        ],
        cross_file_roles=[
            CrossFileRole(
                role_label="Client",
                file_ids=["f1", "f2"],
                field_names_by_file={"f1": ["name"], "f2": ["applicant_name"]},
                is_primary_person=True,
            ),
        ],
        message="Merged Client and Applicant.",
    )
    agent = StubFormAnalyserAgent(expected)

    result = await agent.analyse(
        FormAnalysisRequest(
            files=[
                FileFieldSet(file_id="f1", file_name="a.pdf", form_fields=[FormField(name="name", type="text")]),
                FileFieldSet(
                    file_id="f2", file_name="b.pdf", form_fields=[FormField(name="applicant_name", type="text")]
                ),
            ]
        )
    )

    assert len(result.cross_file_roles) == 1
    assert set(result.cross_file_roles[0].file_ids) == {"f1", "f2"}


@pytest.mark.anyio
async def test_filler_returns_filled_fields() -> None:
    expected = FormFillBatchResponse(
        per_file=[
            FileFillResult(
                file_id="f1",
                filled_fields=[
                    FieldMapping(field_name="name", knowledge_key="full_name", value="John Doe"),
                ],
            )
        ],
        message="Matched 1 field.",
    )
    agent = StubFormFillerAgent(expected)

    result = await agent.fill_batch(
        FormFillBatchRequest(
            files=[
                FileFillRequest(file_id="f1", form_fields=[FormField(name="name", type="text")], role_label="Client")
            ],
            knowledge={"full_name": "John Doe"},
        )
    )

    assert len(result.per_file) == 1
    assert result.per_file[0].filled_fields[0].value == "John Doe"


@pytest.mark.anyio
async def test_filler_returns_empty_when_no_match() -> None:
    expected = FormFillBatchResponse(
        per_file=[FileFillResult(file_id="f1", filled_fields=[])],
        message="No matches.",
    )
    agent = StubFormFillerAgent(expected)

    result = await agent.fill_batch(
        FormFillBatchRequest(
            files=[
                FileFillRequest(file_id="f1", form_fields=[FormField(name="ssn", type="text")], role_label="Client")
            ],
            knowledge={},
        )
    )

    assert len(result.per_file[0].filled_fields) == 0


@pytest.mark.anyio
async def test_document_extractor_single_profile_outcome() -> None:
    expected = KnowledgeUpdateResponse(
        proposed_entries=[KnowledgeEntry(key="full_name", value="John Doe", source="extracted from CV")],
        message="Extracted 1 entry.",
    )
    agent = StubDocumentExtractorAgent(expected)

    result = await agent.extract_multiple(
        DocumentExtractionRequest(documents=[DocumentText(file_name="cv.pdf", text="John Doe, Software Engineer")])
    )

    assert result.outcome == "knowledge_update"
    assert len(result.proposed_entries) == 1
    assert result.proposed_entries[0].key == "full_name"


@pytest.mark.anyio
async def test_document_extractor_multi_profile_outcome() -> None:
    expected = MultiProfileExtractionResponse(
        proposed_profiles=[
            ProposedProfile(
                suggested_name="John Doe",
                entries=[KnowledgeEntry(key="full_name", value="John Doe", source="cv.pdf")],
                source_documents=["cv.pdf"],
            ),
            ProposedProfile(
                suggested_name="Jane Smith",
                entries=[KnowledgeEntry(key="full_name", value="Jane Smith", source="passport.pdf")],
                source_documents=["passport.pdf"],
            ),
        ],
        message="Detected 2 people.",
    )
    agent = StubDocumentExtractorAgent(expected)

    result = await agent.extract_multiple(
        DocumentExtractionRequest(
            documents=[
                DocumentText(file_name="cv.pdf", text="John Doe"),
                DocumentText(file_name="passport.pdf", text="Jane Smith"),
            ]
        )
    )

    assert result.outcome == "multi_profile_extraction"
    assert len(result.proposed_profiles) == 2
