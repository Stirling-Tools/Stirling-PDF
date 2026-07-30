/**
 * Whether a chain of tool steps can actually run, decided from the generated tool I/O table
 * rather than by running it.
 *
 * The same rules exist in the backend (`ToolChainValidator`) and the AI engine
 * (`tool_io_compat.py`). They are duplicated on purpose: a pipeline is checked on every
 * keystroke while it is being edited, and the desktop build has no cloud backend to ask.
 * `testing/tool-io-cases.json` runs against all three, so a rule that changes in one place and
 * not the others fails there.
 */

import {
  TOOL_IO,
  toolIOFor,
  type ToolArity,
  type ToolFormat,
  type ToolIOSpec,
  type ToolIOTable,
} from "@app/types/toolIO";

export type ToolDiagnosticSeverity = "ERROR" | "WARN" | "INFO";

/** Stable identifiers so the UI can pick its own wording. */
export const ToolDiagnosticCode = {
  /** The step declares no I/O, so nothing past it can be checked. */
  Undeclared: "undeclared-operation",
  /** The previous step's output is not a format this step accepts. */
  FormatMismatch: "format-mismatch",
  /** The previous step's output depends on a parameter that is not set yet. */
  OutputUncertain: "output-uncertain",
  /** The pipeline's input files are not a format the first step accepts. */
  SourceMismatch: "source-mismatch",
  /** The previous step emits several files and this one runs once per file. */
  FanOut: "fan-out",
  /** The previous step emits several files and this one consumes them together. */
  FanIn: "fan-in",
} as const;

export type ToolDiagnosticCode =
  (typeof ToolDiagnosticCode)[keyof typeof ToolDiagnosticCode];

export interface ToolDiagnostic {
  /** Zero-based index of the step that cannot run. */
  stepIndex: number;
  severity: ToolDiagnosticSeverity;
  code: ToolDiagnosticCode;
  /** Values for the translated message; the wording itself lives in the locale files. */
  detail: {
    operation: string;
    accepts?: ToolFormat[];
    produced?: ToolFormat;
  };
}

export interface ToolChainStep {
  operation: string;
  /** The step's configured parameters, if known. Only used to resolve a conditional output. */
  parameters?: Record<string, unknown>;
}

export interface ToolChainOptions {
  /** The format of the files entering step one, when known. */
  sourceFormat?: ToolFormat;
  /** Declarations to check against. Defaults to the generated table. */
  toolIO?: ToolIOTable;
}

interface ResolvedOutput {
  format: ToolFormat;
  arity: ToolArity;
  /** False when a conditional output turns on a parameter we cannot see. */
  certain: boolean;
}

function isMultiInput(arity: ToolArity): boolean {
  return arity === "MISO" || arity === "MIMO";
}

function isMultiOutput(arity: ToolArity): boolean {
  return arity === "SIMO" || arity === "MIMO";
}

function normalise(value: unknown): string {
  return value === null || value === undefined
    ? ""
    : String(value).trim().toLowerCase();
}

function acceptsFormat(spec: ToolIOSpec, format: ToolFormat): boolean {
  return (
    format === "ANY" ||
    spec.accepts.includes("ANY") ||
    spec.accepts.includes(format)
  );
}

/**
 * The output of a step configured with `parameters`. The first case whose conditions all hold
 * wins; if none match but one reads a parameter we cannot see, the declared output is returned
 * as uncertain, since a value we never saw might have selected a different branch.
 */
export function resolveOutput(
  spec: ToolIOSpec,
  parameters?: Record<string, unknown>,
): ResolvedOutput {
  let sawUnknownParam = false;
  for (const rule of spec.cases ?? []) {
    let allHold = true;
    for (const condition of rule.when) {
      if (!parameters || !(condition.param in parameters)) {
        sawUnknownParam = true;
        allHold = false;
        continue;
      }
      allHold &&= condition.matches.includes(
        normalise(parameters[condition.param]),
      );
    }
    if (allHold) {
      return { format: rule.produces, arity: rule.arity, certain: true };
    }
  }
  return {
    format: spec.produces,
    arity: spec.arity,
    certain: !sawUnknownParam,
  };
}

/** Check a chain, reporting every problem against the step that cannot run. */
export function validateToolChain(
  steps: ToolChainStep[],
  options: ToolChainOptions = {},
): ToolDiagnostic[] {
  const table = options.toolIO ?? TOOL_IO;
  const diagnostics: ToolDiagnostic[] = [];
  let carried: ResolvedOutput | null = null;

  steps.forEach((step, index) => {
    const spec = toolIOFor(step.operation, table);
    if (!spec) {
      diagnostics.push({
        stepIndex: index,
        severity: "WARN",
        code: ToolDiagnosticCode.Undeclared,
        detail: { operation: step.operation },
      });
      // Nothing is known past an undeclared step, so stop carrying a stale output.
      carried = null;
      return;
    }

    if (carried === null) {
      if (options.sourceFormat && !acceptsFormat(spec, options.sourceFormat)) {
        diagnostics.push({
          stepIndex: index,
          severity: "ERROR",
          code: ToolDiagnosticCode.SourceMismatch,
          detail: {
            operation: step.operation,
            accepts: spec.accepts,
            produced: options.sourceFormat,
          },
        });
      }
    } else {
      diagnostics.push(...checkTransition(index, step, spec, carried));
    }
    carried = resolveOutput(spec, step.parameters);
  });

  return diagnostics;
}

function checkTransition(
  index: number,
  step: ToolChainStep,
  spec: ToolIOSpec,
  previous: ResolvedOutput,
): ToolDiagnostic[] {
  const detail = {
    operation: step.operation,
    accepts: spec.accepts,
    produced: previous.format,
  };

  if (previous.format === "NONE") {
    return [
      {
        stepIndex: index,
        severity: "ERROR",
        code: ToolDiagnosticCode.FormatMismatch,
        detail,
      },
    ];
  }

  if (!acceptsFormat(spec, previous.format)) {
    return [
      {
        stepIndex: index,
        // The previous step's output turns on a parameter we cannot see, so this may yet be
        // fine once it is configured.
        severity: previous.certain ? "ERROR" : "WARN",
        code: previous.certain
          ? ToolDiagnosticCode.FormatMismatch
          : ToolDiagnosticCode.OutputUncertain,
        detail,
      },
    ];
  }

  if (!previous.certain) {
    return [
      {
        stepIndex: index,
        severity: "WARN",
        code: ToolDiagnosticCode.OutputUncertain,
        detail,
      },
    ];
  }

  if (isMultiOutput(previous.arity)) {
    return [
      {
        stepIndex: index,
        severity: "INFO",
        code: isMultiInput(spec.arity)
          ? ToolDiagnosticCode.FanIn
          : ToolDiagnosticCode.FanOut,
        detail,
      },
    ];
  }

  return [];
}

/**
 * The format a chain ends up producing, or undefined when the last step declares nothing. Used to
 * tell a picker what the next step would have to accept.
 */
export function chainOutputFormat(
  steps: ToolChainStep[],
  toolIO: ToolIOTable = TOOL_IO,
): ToolFormat | undefined {
  const last = steps.at(-1);
  if (!last) return undefined;
  const spec = toolIOFor(last.operation, toolIO);
  return spec ? resolveOutput(spec, last.parameters).format : undefined;
}

/** True if a tool could run on `format`. Unknown operations are not claimed to be a problem. */
export function toolAcceptsFormat(
  operation: string,
  format: ToolFormat,
  toolIO: ToolIOTable = TOOL_IO,
): boolean {
  const spec = toolIOFor(operation, toolIO);
  return spec ? acceptsFormat(spec, format) : true;
}

/** True if any diagnostic would stop the chain running. */
export function hasBlockingDiagnostics(diagnostics: ToolDiagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "ERROR");
}

/** The diagnostics for one step, for rendering a note beside it. */
export function diagnosticsForStep(
  diagnostics: ToolDiagnostic[],
  stepIndex: number,
): ToolDiagnostic[] {
  return diagnostics.filter((d) => d.stepIndex === stepIndex);
}
