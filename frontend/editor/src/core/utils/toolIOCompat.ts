/**
 * Whether a chain of steps can run, from the generated I/O table rather than by running it.
 *
 * Duplicated in the backend (`ToolChainValidator`) and the AI engine (`tool_io_compat.py`) on
 * purpose: this runs on every keystroke, and the desktop build has no cloud backend to ask.
 * `testing/tool-io-cases.json` pins all three to the same answers.
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
  stepIndex: number;
  severity: ToolDiagnosticSeverity;
  code: ToolDiagnosticCode;
  /** Interpolation values; the wording lives in the locale files. */
  detail: {
    operation: string;
    accepts?: ToolFormat[];
    produced?: ToolFormat;
  };
}

export interface ToolChainStep {
  /** A plain string: a stored pipeline may name an endpoint this build does not model. */
  operation: string;
  /** Only used to resolve an output that depends on one. */
  parameters?: Record<string, unknown>;
}

export interface ToolChainOptions {
  /** The format entering step one, when known. */
  sourceFormat?: ToolFormat;
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
 * First case whose conditions all hold wins. If none match but one reads a parameter we cannot
 * see, the declared output comes back uncertain: an unseen value might have picked another branch.
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
      const value = normalise(parameters[condition.param]);
      allHold &&= condition.matches.some((match) => normalise(match) === value);
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
      // Nothing is known past an undeclared step.
      carried = null;
      return;
    }

    // Only the first step is handed the pipeline's input. Every later step is handed the previous
    // step's output, which is simply unknown once an undeclared step intervened - checking it
    // against the input again would judge it on a format it never receives.
    if (index === 0) {
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
    } else if (carried !== null) {
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
        // Unresolved output: may yet be fine once the step is configured.
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

/** What a newly appended step would be handed, or undefined when the last step declares nothing. */
export function chainOutputFormat(
  steps: ToolChainStep[],
  toolIO: ToolIOTable = TOOL_IO,
): ToolFormat | undefined {
  const last = steps.at(-1);
  if (!last) return undefined;
  const spec = toolIOFor(last.operation, toolIO);
  return spec ? resolveOutput(spec, last.parameters).format : undefined;
}

/** Unknown operations are not claimed to be a problem. */
export function toolAcceptsFormat(
  operation: string,
  format: ToolFormat,
  toolIO: ToolIOTable = TOOL_IO,
): boolean {
  const spec = toolIOFor(operation, toolIO);
  return spec ? acceptsFormat(spec, format) : true;
}

export function hasBlockingDiagnostics(diagnostics: ToolDiagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "ERROR");
}

export function diagnosticsForStep(
  diagnostics: ToolDiagnostic[],
  stepIndex: number,
): ToolDiagnostic[] {
  return diagnostics.filter((d) => d.stepIndex === stepIndex);
}
