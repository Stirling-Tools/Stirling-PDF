import fs from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTranslatedToolCatalog } from "@editor/data/useTranslatedToolRegistry";
import { parseAutomationFile } from "@editor/utils/automationConverter";
import type { ToolId } from "@editor/types/toolId";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { changeLanguage: vi.fn(), language: "en-US" },
  }),
  Trans: ({ children }: { children?: unknown }) => children,
}));

const EXAMPLES_DIR = path.resolve(
  import.meta.dirname,
  "../../../../../../../app/core/src/main/resources/static/pipeline/defaultWebUIConfigs",
);

const EXPECTED: Record<string, { name: string; operations: string[] }> = {
  "OCR images.json.example": {
    name: "OCR images",
    operations: ["convert", "ocr"],
  },
  "Pre-publish-sanitization.json.example": {
    name: "Strip hidden data before publishing",
    operations: [
      "sanitize",
      "flatten",
      "removeAnnotations",
      "changeMetadata",
      "compress",
    ],
  },
  "Prepare-pdfs-for-email.json.example": {
    name: "Shrink and split for email",
    operations: ["repair", "sanitize", "compress", "split"],
  },
  "split-rotate-auto-rename.json.example": {
    name: "Split into quarters, rotate and rename",
    operations: ["split", "rotate", "autoRename"],
  },
};

describe("shipped server pipeline examples", () => {
  test("the examples on disk are the ones checked here", () => {
    const files = fs
      .readdirSync(EXAMPLES_DIR)
      .filter((f) => f.endsWith(".json.example"))
      .sort();
    expect(files).toEqual(Object.keys(EXPECTED).sort());
  });

  test.each(Object.entries(EXPECTED))(
    "%s maps every step to a tool that targets the step's endpoint",
    (file, expected) => {
      const { result } = renderHook(() => useTranslatedToolCatalog());
      const tools = result.current.allTools;
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8");
      const steps = (
        JSON.parse(text) as { pipeline: Array<{ operation: string }> }
      ).pipeline;

      const { automation, unresolvedOperations } = parseAutomationFile(
        text,
        tools,
      );

      expect(unresolvedOperations).toEqual([]);
      expect(automation.name).toBe(expected.name);
      expect(automation.operations.map((op) => op.operation)).toEqual(
        expected.operations,
      );
      automation.operations.forEach((op, index) => {
        const config = tools[op.operation as ToolId]?.operationConfig;
        expect(config).toBeDefined();
        if (!steps[index].operation.startsWith("/")) return;
        const params = { ...config!.defaultParameters, ...op.parameters };
        const endpoint =
          typeof config!.endpoint === "function"
            ? config!.endpoint(params)
            : config!.endpoint;
        expect(endpoint).toBe(steps[index].operation);
      });
    },
  );
});
