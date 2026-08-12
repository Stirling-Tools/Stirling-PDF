"""Whether a chain of tool steps can actually run, decided from the generated tool I/O table
rather than by running it.

The same rules exist in the backend (``ToolChainValidator``) and the frontend
(``utils/toolIoCompat.ts``). They are duplicated on purpose: the frontend checks a pipeline on
every keystroke, and the engine checks a plan before spending a call per step filling in its
parameters. ``testing/tool-io-cases.json`` runs against all three, so a rule that changes in one
place and not the others fails there.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field

from stirling.models.base import ApiModel
from stirling.models.tool_io import TOOL_IO, ToolArity, ToolFormat, ToolIOSpec
from stirling.models.tool_models import ToolEndpoint


class DiagnosticSeverity(StrEnum):
    """Only ERROR means the chain cannot run as configured."""

    ERROR = "ERROR"
    WARN = "WARN"
    INFO = "INFO"


class DiagnosticCode(StrEnum):
    """Matching the backend and frontend implementations."""

    UNDECLARED = "undeclared-operation"
    FORMAT_MISMATCH = "format-mismatch"
    OUTPUT_UNCERTAIN = "output-uncertain"
    SOURCE_MISMATCH = "source-mismatch"
    FAN_OUT = "fan-out"
    FAN_IN = "fan-in"


class ToolDiagnostic(ApiModel):
    """One problem, against the step that cannot run."""

    step_index: int
    severity: DiagnosticSeverity
    code: DiagnosticCode
    message: str


class ToolChainStep(ApiModel):
    """``parameters`` is only used to resolve an output that depends on one."""

    operation: ToolEndpoint
    parameters: dict[str, object] = Field(default_factory=dict)


class ResolvedOutput(ApiModel):
    """``certain`` is false when a case reads a parameter we cannot see."""

    format: ToolFormat
    arity: ToolArity
    certain: bool


def _is_multi_input(arity: ToolArity) -> bool:
    return arity in (ToolArity.MISO, ToolArity.MIMO)


def _is_multi_output(arity: ToolArity) -> bool:
    return arity in (ToolArity.SIMO, ToolArity.MIMO)


def _accepts_format(spec: ToolIOSpec, candidate: ToolFormat) -> bool:
    return candidate == ToolFormat.ANY or ToolFormat.ANY in spec.accepts or candidate in spec.accepts


def _normalise(value: object) -> str:
    """Both sides of a condition go through this, so a declaration's casing cannot matter."""
    return "" if value is None else str(value).strip().lower()


def resolve_output(spec: ToolIOSpec, parameters: dict[str, object] | None) -> ResolvedOutput:
    """First case whose conditions all hold wins.

    If none match but one reads a parameter we cannot see, the declared output comes back
    uncertain: an unseen value might have picked another branch.
    """
    saw_unknown_param = False
    for rule in spec.cases:
        all_hold = True
        for condition in rule.when:
            if parameters is not None and condition.param in parameters:
                raw: object = parameters[condition.param]
            elif condition.default is not None:
                # The caller omitted it, so it takes the endpoint's default.
                raw = condition.default
            else:
                saw_unknown_param = True
                all_hold = False
                continue
            normalised = _normalise(raw)
            all_hold = all_hold and any(_normalise(m) == normalised for m in condition.matches)
        if all_hold:
            return ResolvedOutput(format=rule.produces, arity=rule.arity, certain=True)
    return ResolvedOutput(format=spec.produces, arity=spec.arity, certain=not saw_unknown_param)


def validate_tool_chain(
    steps: list[ToolChainStep],
    *,
    source_format: ToolFormat | None = None,
    tool_io: dict[ToolEndpoint, ToolIOSpec] | None = None,
) -> list[ToolDiagnostic]:
    """Every problem with the chain, against the step that cannot run."""
    table = TOOL_IO if tool_io is None else tool_io
    diagnostics: list[ToolDiagnostic] = []
    carried: ResolvedOutput | None = None

    for index, step in enumerate(steps):
        spec = table.get(step.operation)
        if spec is None:
            diagnostics.append(
                ToolDiagnostic(
                    step_index=index,
                    severity=DiagnosticSeverity.WARN,
                    code=DiagnosticCode.UNDECLARED,
                    message=(
                        f"{step.operation} does not declare what it accepts or produces, "
                        "so the rest of the chain cannot be checked."
                    ),
                )
            )
            # Nothing is known past an undeclared step.
            carried = None
            continue

        # Only the first step is handed the pipeline's input. Every later step is handed the
        # previous step's output, which is simply unknown once an undeclared step intervened -
        # checking it against the input again would judge it on a format it never receives.
        if index == 0:
            if source_format is not None and not _accepts_format(spec, source_format):
                diagnostics.append(
                    ToolDiagnostic(
                        step_index=index,
                        severity=DiagnosticSeverity.ERROR,
                        code=DiagnosticCode.SOURCE_MISMATCH,
                        message=(f"{step.operation} accepts {_describe(spec)} but the input is {source_format}."),
                    )
                )
        elif carried is not None:
            diagnostics.extend(_check_transition(index, step, spec, carried))
        carried = resolve_output(spec, step.parameters or None)

    return diagnostics


def _check_transition(index: int, step: ToolChainStep, spec: ToolIOSpec, previous: ResolvedOutput) -> list[ToolDiagnostic]:
    if previous.format == ToolFormat.NONE:
        return [
            ToolDiagnostic(
                step_index=index,
                severity=DiagnosticSeverity.ERROR,
                code=DiagnosticCode.FORMAT_MISMATCH,
                message=(f"The previous step returns a report rather than a file, so {step.operation} has nothing to run on."),
            )
        ]

    if not _accepts_format(spec, previous.format):
        message = f"{step.operation} accepts {_describe(spec)} but the previous step produces {previous.format}."
        # Unresolved output: may yet be fine once the step is configured.
        return [
            ToolDiagnostic(
                step_index=index,
                severity=DiagnosticSeverity.ERROR if previous.certain else DiagnosticSeverity.WARN,
                code=DiagnosticCode.FORMAT_MISMATCH if previous.certain else DiagnosticCode.OUTPUT_UNCERTAIN,
                message=message,
            )
        ]

    if not previous.certain:
        return [
            ToolDiagnostic(
                step_index=index,
                severity=DiagnosticSeverity.WARN,
                code=DiagnosticCode.OUTPUT_UNCERTAIN,
                message=(
                    f"The previous step's output depends on how it is configured, so {step.operation} may not be able to run."
                ),
            )
        ]

    if _is_multi_output(previous.arity):
        fan_in = _is_multi_input(spec.arity)
        return [
            ToolDiagnostic(
                step_index=index,
                severity=DiagnosticSeverity.INFO,
                code=DiagnosticCode.FAN_IN if fan_in else DiagnosticCode.FAN_OUT,
                message=(
                    f"{step.operation} combines every file the previous step produced."
                    if fan_in
                    else f"{step.operation} runs once for each file the previous step produced."
                ),
            )
        ]

    return []


def _describe(spec: ToolIOSpec) -> str:
    return " or ".join(sorted(f.value for f in spec.accepts))


def blocking(diagnostics: list[ToolDiagnostic]) -> list[ToolDiagnostic]:
    """The diagnostics that mean the chain cannot run."""
    return [d for d in diagnostics if d.severity == DiagnosticSeverity.ERROR]
