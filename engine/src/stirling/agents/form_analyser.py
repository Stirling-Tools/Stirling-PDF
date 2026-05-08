"""Form Analyser — multi-phase pipeline mirroring PdfEditAgent.

Pipeline:

    1. Deterministic prefix pre-pass (no LLM)
       - Scans field names for known role prefixes (client_*, contractor_*, etc.)
       - Pre-assigns role for any field whose name unambiguously declares one.
       - Pattern: ArithmeticScanner in MathAuditorAgent — deterministic-first.

    2. Phase 1 — RoleDetectorAgent (smart_model)
       - Identifies the *set* of roles per file, cross-file role merges,
         cleaned labels, system/skipped fields.
       - Does NOT assign individual fields to roles.
       - Can refuse via FormAnalysisAmbiguousResponse.
       - Pattern: PdfEditAgent.selection_agent — plan only, no params.

    3. Phase 2 — FieldAssignerAgent (smart_model)
       - For fields not pre-assigned in step 1, decides which role each belongs
         to. One batched call per file given the role list from phase 1.
       - Pattern: PdfEditParameterSelector — fills in details given the plan.

    4. Merge — combines deterministic + LLM assignments into the final
       FormAnalysisResponse. Deterministic assignments always win.
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

from pydantic import Field
from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.output import NativeOutput

from stirling.contracts import format_conversation_history
from stirling.contracts.form_fill import (
    AnalysedFileResult,
    CleanedLabel,
    CrossFileRole,
    DetectedRole,
    FileFieldSet,
    FormAnalysisAmbiguousResponse,
    FormAnalysisRequest,
    FormAnalysisResponse,
    FormAnalysisWorkflowResponse,
    FormField,
)
from stirling.models import ApiModel
from stirling.services import AppRuntime

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Step 1: Deterministic prefix pre-pass
# ---------------------------------------------------------------------------

# Role keywords that, when present as a prefix or early token in a field name,
# unambiguously declare which role the field belongs to. Matched against
# tokenised field names — see _deterministic_role_assignments.
ROLE_KEYWORDS: dict[str, str] = {
    "client": "Client",
    "contractor": "Contractor",
    "applicant": "Applicant",
    "buyer": "Buyer",
    "seller": "Seller",
    "employer": "Employer",
    "employee": "Employee",
    "landlord": "Landlord",
    "tenant": "Tenant",
    "borrower": "Borrower",
    "lender": "Lender",
    "guarantor": "Guarantor",
    "beneficiary": "Beneficiary",
    "policyholder": "Policyholder",
    "patient": "Patient",
    "spouse": "Spouse",
    "witness": "Witness",
    "supplier": "Supplier",
    "vendor": "Vendor",
    "customer": "Customer",
}

_TOKEN_SPLIT = re.compile(r"[_\-\.\[\]\(\)\s/]+")


def _deterministic_role_assignments(fields: Iterable[FormField]) -> dict[str, str]:
    """Return {field_name: role_label} for fields whose name unambiguously
    declares a role via a known prefix / early token.

    A field is assigned only when exactly one role keyword appears in its
    first three tokens. Fields whose name contains zero or multiple role
    keywords are left for the LLM to decide.
    """
    assignments: dict[str, str] = {}
    for field in fields:
        if field.read_only:
            continue
        tokens = [t.lower() for t in _TOKEN_SPLIT.split(field.name) if t]
        if not tokens:
            continue
        head = tokens[:3]
        matches = {ROLE_KEYWORDS[t] for t in head if t in ROLE_KEYWORDS}
        if len(matches) == 1:
            assignments[field.name] = next(iter(matches))
    return assignments


# ---------------------------------------------------------------------------
# Phase 1: Role detection (no per-field assignment)
# ---------------------------------------------------------------------------


class _PerFileRoleSummary(ApiModel):
    file_id: str
    role_labels: list[str]
    primary_role_label: str
    cleaned_labels: list[CleanedLabel] = Field(default_factory=list)
    skipped_field_names: list[str] = Field(default_factory=list)


class _CrossFileRoleSummary(ApiModel):
    canonical_label: str
    file_role_labels: dict[str, str]  # file_id -> per-file role label
    is_primary_person: bool


class _RoleDetectionPlan(ApiModel):
    """Phase-1 output. Lists roles but does NOT assign fields to them.

    The `outcome` literal mirrors the discriminator pattern used by
    PdfEditPlanSelection in `pdf_edit.py` — every member of a NativeOutput
    union needs a tag so pydantic-ai can disambiguate without ambiguity.
    """

    outcome: Literal["role_plan"] = "role_plan"
    per_file: list[_PerFileRoleSummary]
    cross_file_roles: list[_CrossFileRoleSummary]
    message: str = ""


ROLE_DETECTOR_SYSTEM_PROMPT = """\
You analyse PDF forms to identify roles (sections like "Client", "Contractor", \
"Applicant"). Do NOT assign individual fields to roles in this stage — that's a \
separate agent. Your job:

1. PER-FILE ROLES: Identify each distinct role/section in each file. Use field \
name prefixes ("client_*", "f_employer_3"), nearby page-text section headers, and \
form context. If a form has only one section, return one role for it.

2. PRIMARY-PERSON: Mark which role is the form submitter. Heuristics: \
"Client", "Applicant", "Employee", "Patient", "Account Holder", "Policyholder", \
"Tenant", "Borrower", "Buyer" → primary. If ambiguous, mark the first/most \
prominent section. If only one section, mark it primary.

3. CROSS-FILE MERGING: When the same conceptual role appears in multiple files \
(e.g. "Client" in file A and "Applicant" in file B both mean the form submitter), \
merge them into a single cross_file_role with a canonical label. Only merge when \
confident.

4. LABEL CLEANUP: For fields with unreadable labels (numeric codes like \
"0021-6009", technical IDs like "fld_x7q", names with brackets/underscores), find \
the real label from nearby page text and return it as a cleaned_label. Use page \
text verbatim. Skip labels that are already readable.

5. SYSTEM-FIELD DETECTION: Identify form IDs, submission references, tracking \
codes, barcodes, submit buttons. Return their field names in skipped_field_names.

REFUSAL: If the form genuinely has no detectable structure, you may indicate \
ambiguity by returning a role plan with a clear `message` explaining the \
problem (e.g. "47 disconnected fields with no section headers"). The downstream \
agent will surface this to the user.

STRICT:
- Every file must have at least one role.
- cross_file_roles must cover ALL detected roles across all files.
- A role appearing in only one file still appears in cross_file_roles.
- Do NOT return field assignments. That's the next agent's job.
"""


# ---------------------------------------------------------------------------
# Phase 2: Field assignment (given the role plan from phase 1)
# ---------------------------------------------------------------------------


class _FieldAssignment(ApiModel):
    field_name: str
    role_label: str  # must match one of the roles from phase 1


class _FieldAssignmentBatch(ApiModel):
    assignments: list[_FieldAssignment]


FIELD_ASSIGNER_SYSTEM_PROMPT = """\
You receive (a) a list of roles already identified in a PDF form and (b) a list \
of fields that need to be assigned to those roles. Your job is to decide, for \
each field, which role it belongs to.

Use, in priority order:
  a) Field-name signal — prefixes/substrings carry the role directly.
  b) Field-label signal — "Client signature" → Client.
  c) Page-text proximity — a "Date" under "Client signature" → Client.
  d) Section headers — fields inside a "Client Information" block belong to \
     Client even if their own label is generic.

For form-level fields that genuinely apply to both/neither party (project \
description, fees, deliverables, invoice frequency, payment terms, contract \
dates that aren't a signature date): assign to the role most directly responsible \
for that information. Examples — "Description of services" → service provider \
(Contractor); "Fee amount" → Contractor; "Client account number" → Client; \
"Site address" on a job-site form → site/project role. Use semantic judgement; \
don't dump everything on the primary role.

ONLY when (a)–(d) and semantic judgement leave a field genuinely ambiguous AND \
it's a generic form-wide field (e.g. an unmarked "Date" with no nearby signature \
line, "Reference number"): fall back to the primary role.

STRICT:
- Every field given to you must appear in the output exactly once.
- role_label must be one of the roles listed in the prompt.
- Do not invent new roles.
"""


# ---------------------------------------------------------------------------
# Constants used by both phases
# ---------------------------------------------------------------------------

MAX_PAGE_TEXT_CHARS = 1500

# Per-call wall-clock ceilings. Stuck calls would otherwise hold a phase-2
# semaphore slot indefinitely. Retries from output_validator stay inside the
# same Agent.run, so these bound total time including retries.
_PHASE1_TIMEOUT_SECONDS = 120
_PHASE2_TIMEOUT_SECONDS = 60


# ---------------------------------------------------------------------------
# Output validator deps
# ---------------------------------------------------------------------------


@dataclass
class _RoleDetectorDeps:
    file_ids: set[str]


@dataclass
class _FieldAssignerDeps:
    file_id: str
    expected_field_names: set[str]
    allowed_role_labels: set[str]


def _validate_role_plan_output(
    output: _RoleDetectionPlan | FormAnalysisAmbiguousResponse,
    deps: _RoleDetectorDeps,
) -> _RoleDetectionPlan | FormAnalysisAmbiguousResponse:
    """Pure validator for the phase-1 output. Raises ModelRetry on invariant
    violations so pydantic-ai prompts the LLM to correct itself instead of
    leaving the assemble step to patch around the issue. Extracted as a
    module-level function for unit-testability.
    """
    if isinstance(output, FormAnalysisAmbiguousResponse):
        return output
    plan_files = {pf.file_id for pf in output.per_file}
    missing = deps.file_ids - plan_files
    if missing:
        raise ModelRetry(
            "Your role plan is missing per_file entries for these file_ids: "
            f"{sorted(missing)}. Every request file must appear in per_file."
        )
    extra = plan_files - deps.file_ids
    if extra:
        raise ModelRetry(
            "Your role plan includes per_file entries for unknown file_ids: "
            f"{sorted(extra)}. Use the exact file_ids from the request."
        )
    for pf in output.per_file:
        if not pf.role_labels:
            raise ModelRetry(
                f"File {pf.file_id} has empty role_labels. Every file must "
                f"have at least one role."
            )
        if pf.primary_role_label not in pf.role_labels:
            raise ModelRetry(
                f"File {pf.file_id}'s primary_role_label "
                f"'{pf.primary_role_label}' is not in role_labels "
                f"{pf.role_labels}. The primary must be one of the listed roles."
            )
    return output


def _validate_field_assignments_output(
    output: _FieldAssignmentBatch,
    deps: _FieldAssignerDeps,
) -> _FieldAssignmentBatch:
    """Pure validator for the phase-2 output. Each input field must appear
    exactly once with a known role label.
    """
    seen: set[str] = set()
    for fa in output.assignments:
        if fa.field_name in seen:
            raise ModelRetry(
                f"Field '{fa.field_name}' appears in your assignments more "
                f"than once. Each field must appear exactly once."
            )
        seen.add(fa.field_name)
        if fa.field_name not in deps.expected_field_names:
            raise ModelRetry(
                f"Your assignments include unknown field '{fa.field_name}'. "
                f"Only assign fields from the list given to you."
            )
        if fa.role_label not in deps.allowed_role_labels:
            raise ModelRetry(
                f"Field '{fa.field_name}' was assigned to role "
                f"'{fa.role_label}', which is not in the allowed roles "
                f"{sorted(deps.allowed_role_labels)}. Use only the roles listed."
            )
    missing = deps.expected_field_names - seen
    if missing:
        raise ModelRetry(
            f"Your assignments are missing these fields: {sorted(missing)}. "
            f"Every field given to you must appear in the output exactly once."
        )
    return output


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


class FormAnalyserAgent:
    # Bound concurrent phase-2 LLM calls so a 50-file batch doesn't saturate
    # the provider — same pattern as MathAuditorAgent._llm_semaphore.
    _PHASE2_CONCURRENCY = 6

    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime
        self.role_detector = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput([_RoleDetectionPlan, FormAnalysisAmbiguousResponse]),
            system_prompt=ROLE_DETECTOR_SYSTEM_PROMPT,
            model_settings=runtime.smart_model_settings,
            deps_type=_RoleDetectorDeps,
        )
        self.field_assigner = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput(_FieldAssignmentBatch),
            system_prompt=FIELD_ASSIGNER_SYSTEM_PROMPT,
            model_settings=runtime.smart_model_settings,
            deps_type=_FieldAssignerDeps,
        )
        self._register_output_validators()

    def _register_output_validators(self) -> None:
        """Wire the module-level validator functions onto the two agents.
        The LLM gets a chance to correct itself before the assemble step has
        to patch around an invariant violation.
        """

        @self.role_detector.output_validator
        async def _role_plan_validator(
            ctx: RunContext[_RoleDetectorDeps],
            output: _RoleDetectionPlan | FormAnalysisAmbiguousResponse,
        ) -> _RoleDetectionPlan | FormAnalysisAmbiguousResponse:
            return _validate_role_plan_output(output, ctx.deps)

        @self.field_assigner.output_validator
        async def _field_assignments_validator(
            ctx: RunContext[_FieldAssignerDeps],
            output: _FieldAssignmentBatch,
        ) -> _FieldAssignmentBatch:
            return _validate_field_assignments_output(output, ctx.deps)

    async def analyse(self, request: FormAnalysisRequest) -> FormAnalysisWorkflowResponse:
        # Files with zero form fields can't be analysed — short-circuit upstream
        # so phase 1 isn't asked to invent roles for an empty list.
        request = request.model_copy(
            update={"files": [f for f in request.files if f.form_fields]}
        )
        if not request.files:
            return FormAnalysisAmbiguousResponse(
                reason="None of the provided files contain any fillable form fields.",
                suggestion="Check that the PDFs are AcroForm documents (not scans).",
            )

        # Phase 0 — deterministic prefix pre-pass per file.
        deterministic: dict[str, dict[str, str]] = {
            f.file_id: _deterministic_role_assignments(f.form_fields) for f in request.files
        }

        # Phase 1 — role detection only.
        plan_or_refusal = await self._detect_roles(request, deterministic)
        if isinstance(plan_or_refusal, FormAnalysisAmbiguousResponse):
            return plan_or_refusal
        plan = plan_or_refusal

        # Phase 2 — assign remaining (non-deterministic) fields. Files are
        # independent so fan them out under a semaphore (mirrors
        # ledger/agent.py's asyncio.gather + Semaphore pattern).
        per_file_assignments, phase2_warnings = await self._run_phase_2(
            request, plan, deterministic
        )

        # Phase 3 — assemble the response in the legacy shape.
        return self._assemble_response(
            request, plan, per_file_assignments, deterministic, phase2_warnings
        )

    # ------------------------------------------------------------------
    # Phase 2 orchestration
    # ------------------------------------------------------------------

    async def _run_phase_2(
        self,
        request: FormAnalysisRequest,
        plan: _RoleDetectionPlan,
        deterministic: dict[str, dict[str, str]],
    ) -> tuple[dict[str, dict[str, str]], list[str]]:
        """Returns (per_file_assignments, warnings). Warnings describe per-file
        failures so the user can see when phase-2 LLM calls degraded."""
        sem = asyncio.Semaphore(self._PHASE2_CONCURRENCY)

        async def assign_one(
            file_set: FileFieldSet,
            file_plan: _PerFileRoleSummary,
        ) -> tuple[str, dict[str, str]]:
            file_det = deterministic.get(file_set.file_id, {})
            skipped = set(file_plan.skipped_field_names)
            unassigned = [
                f for f in file_set.form_fields
                if f.name not in file_det and f.name not in skipped and not f.read_only
            ]
            if not unassigned:
                return file_set.file_id, dict(file_det)
            async with sem:
                assigned = await self._assign_fields(file_set, file_plan, unassigned)
            merged = dict(file_det)
            for fa in assigned.assignments:
                # Deterministic always wins.
                if fa.field_name not in merged and fa.role_label in file_plan.role_labels:
                    merged[fa.field_name] = fa.role_label
            return file_set.file_id, merged

        tasks: list[tuple[str, str]] = []  # (file_id, file_name) for warnings
        coros = []
        for file_set in request.files:
            file_plan = next((pf for pf in plan.per_file if pf.file_id == file_set.file_id), None)
            if file_plan is None:
                continue
            tasks.append((file_set.file_id, file_set.file_name))
            coros.append(assign_one(file_set, file_plan))

        results = await asyncio.gather(*coros, return_exceptions=True)
        per_file_assignments: dict[str, dict[str, str]] = {}
        warnings: list[str] = []
        for (file_id, file_name), outcome in zip(tasks, results, strict=True):
            if isinstance(outcome, BaseException):
                # Phase-2 failures degrade gracefully — the assemble step's
                # fallback ("everything else → primary") still produces a
                # usable response. Surface a warning so the user knows.
                logger.warning(
                    "form_analyser.fallback",
                    extra={
                        "layer": "phase2_call_failed",
                        "file_id": file_id,
                        "error_type": type(outcome).__name__,
                    },
                )
                warnings.append(
                    f"{file_name}: field-assignment AI call failed ({type(outcome).__name__}); "
                    f"fields attached to primary role as a fallback."
                )
                continue
            file_id_out, merged = outcome
            per_file_assignments[file_id_out] = merged
        return per_file_assignments, warnings

    # ------------------------------------------------------------------
    # Phase 1 helpers
    # ------------------------------------------------------------------

    async def _detect_roles(
        self,
        request: FormAnalysisRequest,
        deterministic: dict[str, dict[str, str]],
    ) -> _RoleDetectionPlan | FormAnalysisAmbiguousResponse:
        prompt = self._build_detection_prompt(request, deterministic)
        deps = _RoleDetectorDeps(file_ids={f.file_id for f in request.files})
        result = await asyncio.wait_for(
            self.role_detector.run(prompt, deps=deps),
            timeout=_PHASE1_TIMEOUT_SECONDS,
        )
        return result.output

    def _build_detection_prompt(
        self,
        request: FormAnalysisRequest,
        deterministic: dict[str, dict[str, str]],
    ) -> str:
        sections = []
        for file_set in request.files:
            page_section, field_page_map = self._format_page_texts(file_set)
            fields_text = "\n".join(
                self._format_field(f, field_page_map.get(f.name)) for f in file_set.form_fields
            )
            det_section = self._format_deterministic_hints(deterministic.get(file_set.file_id, {}))
            sections.append(
                f"=== FILE: {file_set.file_name} (id={file_set.file_id}) ===\n"
                f"Page texts:\n{page_section}\n\n"
                f"{det_section}"
                f"Fields:\n{fields_text}"
            )

        history = format_conversation_history(request.conversation_history)
        return (
            f"Conversation history:\n{history}\n\n"
            f"Identify roles in {len(request.files)} form(s). "
            "Do NOT assign individual fields to roles — that's a separate agent.\n\n"
            + "\n\n".join(sections)
        )

    def _format_deterministic_hints(self, assignments: dict[str, str]) -> str:
        """Build a "Pre-detected roles" prompt block listing the regex-derived
        role assignments. Importantly, lists each role's fields so the LLM has
        evidence rather than just a label, and asks it to use these labels
        verbatim — otherwise role names diverge between phases and the
        downstream merge silently drops fields.
        """
        if not assignments:
            return ""
        by_role: dict[str, list[str]] = {}
        for field_name, role_label in assignments.items():
            by_role.setdefault(role_label, []).append(field_name)
        lines = [
            "Pre-detected roles in this file (from field-name prefixes — keep these "
            "exact role labels in your `role_labels` output; do not rename them):",
        ]
        for role_label in sorted(by_role):
            fields = ", ".join(sorted(by_role[role_label])[:8])
            extra = "" if len(by_role[role_label]) <= 8 else f" (+{len(by_role[role_label]) - 8} more)"
            lines.append(f"  - {role_label}: {fields}{extra}")
        return "\n".join(lines) + "\n\n"

    # ------------------------------------------------------------------
    # Phase 2 helpers
    # ------------------------------------------------------------------

    async def _assign_fields(
        self,
        file_set: FileFieldSet,
        file_plan: _PerFileRoleSummary,
        unassigned: list[FormField],
    ) -> _FieldAssignmentBatch:
        prompt = self._build_assignment_prompt(file_set, file_plan, unassigned)
        deps = _FieldAssignerDeps(
            file_id=file_set.file_id,
            expected_field_names={f.name for f in unassigned},
            allowed_role_labels=set(file_plan.role_labels),
        )
        result = await asyncio.wait_for(
            self.field_assigner.run(prompt, deps=deps),
            timeout=_PHASE2_TIMEOUT_SECONDS,
        )
        return result.output

    def _build_assignment_prompt(
        self,
        file_set: FileFieldSet,
        file_plan: _PerFileRoleSummary,
        unassigned: list[FormField],
    ) -> str:
        page_section, field_page_map = self._format_page_texts(file_set)
        fields_text = "\n".join(
            self._format_field(f, field_page_map.get(f.name)) for f in unassigned
        )
        roles_list = ", ".join(file_plan.role_labels)
        return (
            f"=== FILE: {file_set.file_name} (id={file_set.file_id}) ===\n"
            f"Roles in this file: {roles_list}\n"
            f"Primary role: {file_plan.primary_role_label}\n\n"
            f"Page texts:\n{page_section}\n\n"
            f"Assign each of these {len(unassigned)} field(s) to one of the roles above:\n"
            f"{fields_text}"
        )

    # ------------------------------------------------------------------
    # Phase 3 — assemble the legacy-shaped FormAnalysisResponse
    # ------------------------------------------------------------------

    def _assemble_response(
        self,
        request: FormAnalysisRequest,
        plan: _RoleDetectionPlan,
        per_file_assignments: dict[str, dict[str, str]],
        deterministic: dict[str, dict[str, str]],
        extra_warnings: list[str] | None = None,
    ) -> FormAnalysisResponse:
        per_file_results: list[AnalysedFileResult] = []
        warnings: list[str] = list(extra_warnings or [])

        for file_set in request.files:
            file_plan = next((pf for pf in plan.per_file if pf.file_id == file_set.file_id), None)
            if file_plan is None:
                logger.warning(
                    "form_analyser.fallback",
                    extra={
                        "layer": "phase1_missing_per_file",
                        "file_id": file_set.file_id,
                    },
                )
                warnings.append(
                    f"{file_set.file_name}: role detector returned no roles — falling back "
                    f"to a single Primary role."
                )
                file_plan = _PerFileRoleSummary(
                    file_id=file_set.file_id,
                    role_labels=["Primary"],
                    primary_role_label="Primary",
                )
            # Defensive copy — _assemble_response shouldn't mutate dicts owned
            # by phase-2's result. (Today the caller doesn't reuse them, but
            # callers shouldn't have to remember that.)
            assignments = dict(per_file_assignments.get(file_set.file_id, {}))
            skipped = set(file_plan.skipped_field_names)

            # Anything still missing — the LLM didn't assign and there was no
            # deterministic prefix — gets attached to the primary role.
            orphan_count = 0
            for field in file_set.form_fields:
                if field.read_only or field.name in skipped or field.name in assignments:
                    continue
                assignments[field.name] = file_plan.primary_role_label
                orphan_count += 1
            if orphan_count:
                logger.warning(
                    "form_analyser.fallback",
                    extra={
                        "layer": "orphan_to_primary",
                        "file_id": file_set.file_id,
                        "count": orphan_count,
                    },
                )

            # Union the LLM's role labels with any role label that appears in
            # `assignments` (e.g. from the deterministic pre-pass) but wasn't
            # listed by phase 1. Without this, deterministic-tagged fields under
            # a role the LLM renamed/missed would be silently dropped from every
            # DetectedRole. Order: LLM's order first (preserves primary), then
            # any extras in the order they first appear in assignments.
            extra_labels: list[str] = []
            seen = set(file_plan.role_labels)
            for label in assignments.values():
                if label not in seen:
                    seen.add(label)
                    extra_labels.append(label)
            all_role_labels = [*file_plan.role_labels, *extra_labels]
            if extra_labels:
                logger.warning(
                    "form_analyser.fallback",
                    extra={
                        "layer": "deterministic_label_union",
                        "file_id": file_set.file_id,
                        "extra_labels": extra_labels,
                    },
                )
                warnings.append(
                    f"{file_set.file_name}: kept {len(extra_labels)} pre-detected "
                    f"role(s) not listed by the AI: {', '.join(extra_labels)}."
                )

            detected: list[DetectedRole] = []
            for role_label in all_role_labels:
                role_fields = [n for n, r in assignments.items() if r == role_label]
                detected.append(
                    DetectedRole(
                        role_label=role_label,
                        field_names=role_fields,
                        is_primary_person=(role_label == file_plan.primary_role_label),
                    )
                )

            per_file_results.append(
                AnalysedFileResult(
                    file_id=file_set.file_id,
                    file_name=file_set.file_name,
                    detected_roles=detected,
                    cleaned_labels=file_plan.cleaned_labels,
                    skipped_field_names=file_plan.skipped_field_names,
                )
            )

        cross_file_roles = self._build_cross_file_roles(plan, per_file_results)

        det_count = sum(len(d) for d in deterministic.values())
        message_parts: list[str] = []
        if plan.message:
            message_parts.append(plan.message)
        if det_count:
            message_parts.append(
                f"{det_count} field(s) assigned deterministically by name prefix."
            )
        message_parts.extend(warnings)

        return FormAnalysisResponse(
            per_file=per_file_results,
            cross_file_roles=cross_file_roles,
            message=" ".join(message_parts).strip(),
        )

    def _build_cross_file_roles(
        self,
        plan: _RoleDetectionPlan,
        per_file_results: list[AnalysedFileResult],
    ) -> list[CrossFileRole]:
        results_by_id = {r.file_id: r for r in per_file_results}
        cross: list[CrossFileRole] = []

        # Track which (file_id, per_file_role_label) pairs we successfully
        # resolved — used both for the safety net and to report which files
        # the cross-file role actually covers.
        resolved_pairs: list[tuple[str, str]] = []

        for cfr in plan.cross_file_roles:
            field_names_by_file: dict[str, list[str]] = {}
            for file_id, per_file_role_label in cfr.file_role_labels.items():
                pf_result = results_by_id.get(file_id)
                if pf_result is None:
                    continue
                role = self._resolve_per_file_role(pf_result, per_file_role_label, cfr.canonical_label)
                if role is None:
                    continue
                field_names_by_file[file_id] = list(role.field_names)
                resolved_pairs.append((file_id, role.role_label))
            cross.append(
                CrossFileRole(
                    role_label=cfr.canonical_label,
                    file_ids=list(field_names_by_file.keys()),
                    field_names_by_file=field_names_by_file,
                    is_primary_person=cfr.is_primary_person,
                )
            )

        # Safety net — any per-file role label that didn't make it into a
        # cross_file_role at all gets its own single-file entry.
        covered: set[tuple[str, str]] = set(resolved_pairs)
        for cfr in plan.cross_file_roles:
            for fid, lbl in cfr.file_role_labels.items():
                covered.add((fid, lbl))

        for pf in per_file_results:
            for role in pf.detected_roles:
                if (pf.file_id, role.role_label) in covered:
                    continue
                cross.append(
                    CrossFileRole(
                        role_label=role.role_label,
                        file_ids=[pf.file_id],
                        field_names_by_file={pf.file_id: list(role.field_names)},
                        is_primary_person=role.is_primary_person,
                    )
                )

        return cross

    def _resolve_per_file_role(
        self,
        pf_result: AnalysedFileResult,
        requested_label: str,
        canonical_label: str,
    ) -> DetectedRole | None:
        """Find the DetectedRole matching `requested_label`, with fallbacks.

        The LLM is told to put each file's per-file role label in
        `cfr.file_role_labels[file_id]`, but inconsistencies happen — it may
        put the canonical label there instead, or use slightly different
        capitalisation. This method tries:
          1. Exact match on requested_label.
          2. Case-insensitive match on requested_label.
          3. Exact / case-insensitive match on canonical_label.
        Returns None if nothing matches.
        """
        # 1. Exact.
        for role in pf_result.detected_roles:
            if role.role_label == requested_label:
                return role
        # 2. Case-insensitive on requested_label.
        requested_ci = requested_label.casefold()
        for role in pf_result.detected_roles:
            if role.role_label.casefold() == requested_ci:
                return role
        # 3. Fall back to canonical label (exact, then case-insensitive).
        if canonical_label != requested_label:
            for role in pf_result.detected_roles:
                if role.role_label == canonical_label:
                    return role
            canonical_ci = canonical_label.casefold()
            for role in pf_result.detected_roles:
                if role.role_label.casefold() == canonical_ci:
                    return role
        return None

    # ------------------------------------------------------------------
    # Shared formatting helpers
    # ------------------------------------------------------------------

    def _format_page_texts(self, file_set: FileFieldSet) -> tuple[str, dict[str, int]]:
        page_texts: dict[str, int] = {}
        field_page_map: dict[str, int] = {}
        for field in file_set.form_fields:
            if field.nearby_page_text:
                text = field.nearby_page_text
                if text not in page_texts:
                    page_texts[text] = len(page_texts)
                field_page_map[field.name] = page_texts[text]
        page_section = "\n".join(
            f"  [Page {pid}]: {text[:MAX_PAGE_TEXT_CHARS]}" for text, pid in page_texts.items()
        )
        return page_section, field_page_map

    def _format_field(self, field: FormField, page_id: int | None) -> str:
        parts = [f"- name={field.name}, type={field.type}"]
        if field.label:
            parts.append(f"  label={field.label}")
        if field.tooltip:
            parts.append(f"  tooltip={field.tooltip}")
        if field.options:
            parts.append(f"  options={field.options}")
        if field.required:
            parts.append("  required=true")
        if field.read_only:
            parts.append("  readOnly=true")
        if page_id is not None:
            parts.append(f"  page={page_id}")
        return "\n".join(parts)
