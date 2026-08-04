/** The shared cases in `testing/tool-io-cases.json`, which all three implementations run. */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

/** Shared with the backend and engine, so it lives at the repo root. */
function casesFile(): string {
  let current = dirname(fileURLToPath(import.meta.url));
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

/** The detail payload is free, so compare only the contractual parts. */
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
