/** The shared cases in `testing/tool-io-cases.json`, which all three implementations run. */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  validateToolChain,
  toolAcceptsFile,
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
  // fileURLToPath, not URL.pathname: on Windows the latter yields "/C:/..." and
  // resolving against it produces a "C:\C:\..." path that never matches.
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

describe("tool file inputs", () => {
  it.each([
    ["/api/v1/misc/compress-pdf", "document.PDF", true],
    ["/api/v1/misc/compress-pdf", "photo.png", false],
    ["/api/v1/misc/extract-image-scans", "document.PDF", true],
    ["/api/v1/misc/extract-image-scans", "scan.png", true],
    ["/api/v1/misc/extract-image-scans", "scan.JPEG", true],
    ["/api/v1/misc/extract-image-scans", "scan.tiff", true],
    ["/api/v1/misc/extract-image-scans", "scan.pgm", true],
    ["/api/v1/misc/extract-image-scans", "drawing.svg", false],
    ["/api/v1/misc/extract-image-scans", "drawing.psd", false],
    ["/api/v1/misc/extract-image-scans", "document.docx", false],
    ["/api/v1/convert/svg/pdf", "drawing.svg", true],
    ["/api/v1/convert/svg/pdf", "photo.png", false],
    ["/api/v1/convert/html/pdf", "site.zip", true],
    ["/api/v1/convert/html/pdf", "site.rar", false],
    ["/api/v1/convert/markdown/pdf", "readme.txt", false],
    ["/api/v1/convert/markdown/pdf", "site.zip", true],
    ["/api/v1/convert/img/pdf", "photo.jpeg", true],
    ["/api/v1/convert/img/pdf", "photo.wbmp", true],
    ["/api/v1/convert/img/pdf", "drawing.eps", false],
    ["/api/v1/convert/cbz/pdf", "book.zip", true],
    ["/api/v1/convert/cbr/pdf", "book.rar", true],
    ["/api/v1/convert/ebook/pdf", "document.docx", true],
    ["/api/v1/misc/compress-pdf", "unknown", false],
  ])("checks %s against %s", (endpoint, name, accepted) => {
    expect(toolAcceptsFile(endpoint, { name, type: "" })).toBe(accepted);
  });

  it("uses detected protection and the endpoint's encrypted input declaration", () => {
    const file = {
      name: "document.pdf",
      type: "",
      processedFile: { pages: [], isEncrypted: true },
    };
    expect(toolAcceptsFile("/api/v1/misc/compress-pdf", file)).toBe(false);
    expect(toolAcceptsFile("/api/v1/misc/extract-image-scans", file)).toBe(
      false,
    );
    expect(toolAcceptsFile("/api/v1/security/remove-password", file)).toBe(
      true,
    );
    expect(toolAcceptsFile("/api/v1/convert/file/pdf", file)).toBe(true);
    file.processedFile.isEncrypted = false;
    expect(toolAcceptsFile("/api/v1/misc/compress-pdf", file)).toBe(true);
  });

  it.each([undefined, "/unknown"])(
    "skips encrypted PDFs without a declaration for %s",
    (endpoint) => {
      const file = {
        name: "document.pdf",
        type: "application/pdf",
        processedFile: { pages: [], isEncrypted: true },
      };
      expect(toolAcceptsFile(endpoint, file)).toBe(false);
      file.processedFile.isEncrypted = false;
      expect(toolAcceptsFile(endpoint, file)).toBe(true);
    },
  );
});
