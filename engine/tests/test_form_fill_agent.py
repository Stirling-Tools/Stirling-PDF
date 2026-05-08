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


# ---------------------------------------------------------------------------
# Pipeline-piece tests — these exercise the deterministic pre-pass and the
# response assembler directly, without going through the LLM. Stubbing the
# full agent is not enough since the new pipeline has correctness logic
# inside _deterministic_role_assignments and _assemble_response.
# ---------------------------------------------------------------------------


def _make_field(name: str, **kwargs: object) -> FormField:
    """Helper — build a minimal FormField with sensible defaults."""
    base: dict[str, object] = {"name": name, "type": "text"}
    base.update(kwargs)
    return FormField(**base)  # type: ignore[arg-type]


def test_deterministic_assigns_obvious_prefix() -> None:
    from stirling.agents.form_analyser import _deterministic_role_assignments

    fields = [
        _make_field("client_first_name"),
        _make_field("contractor_signature"),
        _make_field("date"),  # ambiguous — no role keyword
    ]
    result = _deterministic_role_assignments(fields)
    assert result == {"client_first_name": "Client", "contractor_signature": "Contractor"}


def test_deterministic_skips_multi_role_names() -> None:
    from stirling.agents.form_analyser import _deterministic_role_assignments

    # A name containing two role keywords is ambiguous — leave it for the LLM.
    fields = [_make_field("client_contractor_summary")]
    assert _deterministic_role_assignments(fields) == {}


def test_deterministic_skips_readonly() -> None:
    from stirling.agents.form_analyser import _deterministic_role_assignments

    fields = [_make_field("client_first_name", read_only=True)]
    assert _deterministic_role_assignments(fields) == {}


def test_deterministic_handles_irs_naming() -> None:
    from stirling.agents.form_analyser import _deterministic_role_assignments

    # IRS-style names like "f_employer_3" should still resolve to Employer.
    fields = [_make_field("f_employer_3"), _make_field("f_employee_1")]
    result = _deterministic_role_assignments(fields)
    assert result == {"f_employer_3": "Employer", "f_employee_1": "Employee"}


def test_assemble_preserves_deterministic_labels_when_llm_renames() -> None:
    """Regression test for Bug C/H: when the regex pre-pass tags fields under
    "Client"/"Contractor" but the LLM phase 1 returns ["Customer", "Vendor"],
    the deterministic-tagged fields must still appear in the final response —
    they used to be silently dropped from every DetectedRole.
    """
    from stirling.agents.form_analyser import (
        FormAnalyserAgent,
        _PerFileRoleSummary,
        _RoleDetectionPlan,
    )

    runtime = build_runtime(build_app_settings())
    agent = FormAnalyserAgent(runtime)

    request = FormAnalysisRequest(
        files=[
            FileFieldSet(
                file_id="f1",
                file_name="form.pdf",
                form_fields=[
                    _make_field("client_first_name"),  # deterministic → Client
                    _make_field("contractor_signature"),  # deterministic → Contractor
                    _make_field("project_description"),  # LLM-assigned
                ],
            )
        ]
    )
    plan = _RoleDetectionPlan(
        per_file=[
            _PerFileRoleSummary(
                file_id="f1",
                role_labels=["Customer", "Vendor"],  # LLM renamed
                primary_role_label="Customer",
            )
        ],
        cross_file_roles=[],
    )
    deterministic = {
        "f1": {"client_first_name": "Client", "contractor_signature": "Contractor"}
    }
    per_file_assignments = {
        "f1": {
            "client_first_name": "Client",
            "contractor_signature": "Contractor",
            "project_description": "Vendor",
        }
    }

    result = agent._assemble_response(request, plan, per_file_assignments, deterministic)

    # Every fillable field must end up in *some* role's field_names.
    all_assigned = {
        n
        for r in result.per_file[0].detected_roles
        for n in r.field_names
    }
    assert all_assigned == {"client_first_name", "contractor_signature", "project_description"}

    # Both deterministic labels survive even though they're not in plan.role_labels.
    role_labels = {r.role_label for r in result.per_file[0].detected_roles}
    assert {"Client", "Contractor", "Customer", "Vendor"} <= role_labels


def test_assemble_attaches_orphan_fields_to_primary() -> None:
    """Phase 2 omits a field. The safety net attaches it to the primary role."""
    from stirling.agents.form_analyser import (
        FormAnalyserAgent,
        _PerFileRoleSummary,
        _RoleDetectionPlan,
    )

    runtime = build_runtime(build_app_settings())
    agent = FormAnalyserAgent(runtime)

    request = FormAnalysisRequest(
        files=[
            FileFieldSet(
                file_id="f1",
                file_name="form.pdf",
                form_fields=[
                    _make_field("known_field"),
                    _make_field("orphan_field"),  # neither LLM nor regex assigned it
                ],
            )
        ]
    )
    plan = _RoleDetectionPlan(
        per_file=[
            _PerFileRoleSummary(
                file_id="f1",
                role_labels=["Primary"],
                primary_role_label="Primary",
            )
        ],
        cross_file_roles=[],
    )
    result = agent._assemble_response(
        request,
        plan,
        per_file_assignments={"f1": {"known_field": "Primary"}},
        deterministic={"f1": {}},
    )
    primary = next(r for r in result.per_file[0].detected_roles if r.is_primary_person)
    assert "orphan_field" in primary.field_names


def test_resolve_per_file_role_case_insensitive() -> None:
    from stirling.agents.form_analyser import FormAnalyserAgent

    runtime = build_runtime(build_app_settings())
    agent = FormAnalyserAgent(runtime)

    pf = AnalysedFileResult(
        file_id="f1",
        file_name="form.pdf",
        detected_roles=[
            DetectedRole(role_label="Client", field_names=["a"], is_primary_person=True),
        ],
    )
    # Exact match.
    assert agent._resolve_per_file_role(pf, "Client", "Client") is not None
    # Different case still matches.
    assert agent._resolve_per_file_role(pf, "client", "Client") is not None
    # Falls back to canonical when requested label isn't there at all.
    assert agent._resolve_per_file_role(pf, "Applicant", "Client") is not None
    # Truly unknown role → None.
    assert agent._resolve_per_file_role(pf, "Witness", "Witness") is None


# ---------------------------------------------------------------------------
# Output-validator tests — exercised as pure functions so we don't need an
# LLM stub. Each test feeds an LLM response that violates an invariant and
# asserts the validator raises ModelRetry, which is what pydantic-ai uses
# to re-prompt the model.
# ---------------------------------------------------------------------------


def test_role_plan_validator_rejects_missing_file_id() -> None:
    from pydantic_ai import ModelRetry

    from stirling.agents.form_analyser import (
        _PerFileRoleSummary,
        _RoleDetectionPlan,
        _RoleDetectorDeps,
        _validate_role_plan_output,
    )

    deps = _RoleDetectorDeps(file_ids={"f1", "f2"})
    plan = _RoleDetectionPlan(
        per_file=[
            _PerFileRoleSummary(file_id="f1", role_labels=["Client"], primary_role_label="Client"),
        ],
        cross_file_roles=[],
    )
    with pytest.raises(ModelRetry, match="missing per_file"):
        _validate_role_plan_output(plan, deps)


def test_role_plan_validator_rejects_unknown_file_id() -> None:
    from pydantic_ai import ModelRetry

    from stirling.agents.form_analyser import (
        _PerFileRoleSummary,
        _RoleDetectionPlan,
        _RoleDetectorDeps,
        _validate_role_plan_output,
    )

    deps = _RoleDetectorDeps(file_ids={"f1"})
    plan = _RoleDetectionPlan(
        per_file=[
            _PerFileRoleSummary(file_id="f1", role_labels=["Client"], primary_role_label="Client"),
            _PerFileRoleSummary(file_id="ghost", role_labels=["Client"], primary_role_label="Client"),
        ],
        cross_file_roles=[],
    )
    with pytest.raises(ModelRetry, match="unknown file_ids"):
        _validate_role_plan_output(plan, deps)


def test_role_plan_validator_rejects_invalid_primary_label() -> None:
    from pydantic_ai import ModelRetry

    from stirling.agents.form_analyser import (
        _PerFileRoleSummary,
        _RoleDetectionPlan,
        _RoleDetectorDeps,
        _validate_role_plan_output,
    )

    deps = _RoleDetectorDeps(file_ids={"f1"})
    plan = _RoleDetectionPlan(
        per_file=[
            _PerFileRoleSummary(
                file_id="f1",
                role_labels=["Client", "Contractor"],
                primary_role_label="Vendor",  # not in role_labels
            ),
        ],
        cross_file_roles=[],
    )
    with pytest.raises(ModelRetry, match="primary_role_label"):
        _validate_role_plan_output(plan, deps)


def test_role_plan_validator_passes_ambiguous_response_through() -> None:
    """Refusal responses bypass the validator — there's no plan to check."""
    from stirling.agents.form_analyser import (
        _RoleDetectorDeps,
        _validate_role_plan_output,
    )
    from stirling.contracts.form_fill import FormAnalysisAmbiguousResponse

    deps = _RoleDetectorDeps(file_ids={"f1"})
    refusal = FormAnalysisAmbiguousResponse(reason="cannot tell roles", suggestion=None)
    assert _validate_role_plan_output(refusal, deps) is refusal


def test_field_assigner_validator_rejects_unknown_field() -> None:
    from pydantic_ai import ModelRetry

    from stirling.agents.form_analyser import (
        _FieldAssignerDeps,
        _FieldAssignment,
        _FieldAssignmentBatch,
        _validate_field_assignments_output,
    )

    deps = _FieldAssignerDeps(
        file_id="f1",
        expected_field_names={"a", "b"},
        allowed_role_labels={"Client"},
    )
    batch = _FieldAssignmentBatch(
        assignments=[
            _FieldAssignment(field_name="a", role_label="Client"),
            _FieldAssignment(field_name="b", role_label="Client"),
            _FieldAssignment(field_name="c", role_label="Client"),  # not in expected
        ]
    )
    with pytest.raises(ModelRetry, match="unknown field 'c'"):
        _validate_field_assignments_output(batch, deps)


def test_field_assigner_validator_rejects_unknown_role() -> None:
    from pydantic_ai import ModelRetry

    from stirling.agents.form_analyser import (
        _FieldAssignerDeps,
        _FieldAssignment,
        _FieldAssignmentBatch,
        _validate_field_assignments_output,
    )

    deps = _FieldAssignerDeps(
        file_id="f1",
        expected_field_names={"a"},
        allowed_role_labels={"Client", "Contractor"},
    )
    batch = _FieldAssignmentBatch(
        assignments=[_FieldAssignment(field_name="a", role_label="Vendor")]
    )
    with pytest.raises(ModelRetry, match="not in the allowed roles"):
        _validate_field_assignments_output(batch, deps)


def test_field_assigner_validator_rejects_missing_field() -> None:
    from pydantic_ai import ModelRetry

    from stirling.agents.form_analyser import (
        _FieldAssignerDeps,
        _FieldAssignment,
        _FieldAssignmentBatch,
        _validate_field_assignments_output,
    )

    deps = _FieldAssignerDeps(
        file_id="f1",
        expected_field_names={"a", "b"},
        allowed_role_labels={"Client"},
    )
    batch = _FieldAssignmentBatch(
        assignments=[_FieldAssignment(field_name="a", role_label="Client")]
    )
    with pytest.raises(ModelRetry, match="missing these fields"):
        _validate_field_assignments_output(batch, deps)


def test_field_assigner_validator_rejects_duplicate_field() -> None:
    from pydantic_ai import ModelRetry

    from stirling.agents.form_analyser import (
        _FieldAssignerDeps,
        _FieldAssignment,
        _FieldAssignmentBatch,
        _validate_field_assignments_output,
    )

    deps = _FieldAssignerDeps(
        file_id="f1",
        expected_field_names={"a"},
        allowed_role_labels={"Client"},
    )
    batch = _FieldAssignmentBatch(
        assignments=[
            _FieldAssignment(field_name="a", role_label="Client"),
            _FieldAssignment(field_name="a", role_label="Client"),
        ]
    )
    with pytest.raises(ModelRetry, match="more than once"):
        _validate_field_assignments_output(batch, deps)


def test_field_assigner_validator_accepts_valid_output() -> None:
    """Sanity — a well-formed batch returns unchanged."""
    from stirling.agents.form_analyser import (
        _FieldAssignerDeps,
        _FieldAssignment,
        _FieldAssignmentBatch,
        _validate_field_assignments_output,
    )

    deps = _FieldAssignerDeps(
        file_id="f1",
        expected_field_names={"a", "b"},
        allowed_role_labels={"Client", "Contractor"},
    )
    batch = _FieldAssignmentBatch(
        assignments=[
            _FieldAssignment(field_name="a", role_label="Client"),
            _FieldAssignment(field_name="b", role_label="Contractor"),
        ]
    )
    assert _validate_field_assignments_output(batch, deps) is batch


@pytest.mark.anyio
async def test_analyser_refuses_when_all_files_empty() -> None:
    """A request with files but zero form fields should surface as ambiguity."""
    from stirling.agents.form_analyser import FormAnalyserAgent
    from stirling.contracts.form_fill import FormAnalysisAmbiguousResponse

    runtime = build_runtime(build_app_settings())
    agent = FormAnalyserAgent(runtime)

    request = FormAnalysisRequest(
        files=[FileFieldSet(file_id="f1", file_name="empty.pdf", form_fields=[])]
    )
    result = await agent.analyse(request)
    assert isinstance(result, FormAnalysisAmbiguousResponse)
