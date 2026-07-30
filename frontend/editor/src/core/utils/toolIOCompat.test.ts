/**
 * Runs the shared cases in `testing/tool-io-cases.json`.
 *
 * The backend and the AI engine run the same file against their own implementations, so a rule
 * that changes in one place and not the others fails here.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateToolChain,
  type ToolChainStep,
  type ToolDiagnostic,
} from "@app/utils/toolIOCompat";
import { type ToolEndpoint, TOOL_ENDPOINTS } from "@app/types/toolApiTypes";
import {
  type ToolFormat,
  type ToolIOSpec,
  type ToolIOTable,
} from "@app/types/toolIO";

interface SharedCase {
  name: string;
  sourceFormat?: ToolFormat;
  steps: { spec: string | null; parameters?: Record<string, unknown> }[];
  expected: { stepIndex: number; severity: string; code: string }[];
}

/** The fixture is shared with the backend and engine, so it lives at the repo root. */
function casesFile(): string {
  let current = dirname(new URL(import.meta.url).pathname);
  for (let i = 0; i < 12; i++) {
    const candidate = resolve(current, "testing/tool-io-cases.json");
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      current = resolve(current, "..");
    }
  }
  throw new Error(
    "testing/tool-io-cases.json not found above the test directory",
  );
}

const data = JSON.parse(readFileSync(casesFile(), "utf-8")) as {
  specs: Record<string, ToolIOSpec>;
  cases: SharedCase[];
};

/** Compare on the parts that are contractual; the detail payload is free. */
function summarise(diagnostics: ToolDiagnostic[]): string[] {
  return diagnostics.map((d) => `${d.stepIndex}:${d.severity}:${d.code}`);
}

describe("tool chain conformance", () => {
  for (const testCase of data.cases) {
    it(testCase.name, () => {
      const table: ToolIOTable = {};
      const steps: ToolChainStep[] = testCase.steps.map((step, index) => {
        // Distinct endpoints so the same spec can appear twice in a chain. Which ones is
        // irrelevant: the case supplies its own table, these are just keys.
        const operation: ToolEndpoint = TOOL_ENDPOINTS[index];
        if (step.spec !== null) table[operation] = data.specs[step.spec];
        return { operation, parameters: step.parameters };
      });

      const actual = validateToolChain(steps, {
        sourceFormat: testCase.sourceFormat,
        toolIO: table,
      });

      expect(summarise(actual)).toEqual(
        testCase.expected.map((e) => `${e.stepIndex}:${e.severity}:${e.code}`),
      );
    });
  }
});
