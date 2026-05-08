/**
 * Unit tests for automationConverter import/export round-tripping.
 */

import { describe, test, expect } from "vitest";
import {
  convertToAutomationConfig,
  convertToFolderScanningConfig,
  detectAutomationFormat,
  parseAutomationConfigJson,
  parseAutomationFile,
  parseFolderScanningConfig,
} from "@app/utils/automationConverter";
import { AutomationConfig } from "@app/types/automation";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

// Minimal stub registry — only the fields automationConverter actually reads.
const registry = {
  merge: {
    operationConfig: {
      endpoint: "/api/v1/general/merge-pdfs",
    },
  },
  compress: {
    operationConfig: {
      endpoint: "/api/v1/misc/compress-pdf",
    },
  },
  ocr: {
    operationConfig: {
      endpoint: "/api/v1/misc/ocr-pdf",
    },
  },
  // Dynamic endpoint — endpoint depends on parameters.
  convert: {
    operationConfig: {
      endpoint: (params: Record<string, any>) =>
        `/api/v1/convert/${params.fromExtension}-to-${params.toExtension}`,
    },
  },
} as unknown as Partial<ToolRegistry>;

const sampleAutomation: AutomationConfig = {
  id: "auto-123",
  name: "Sample",
  description: "Test automation",
  icon: "CompressIcon",
  operations: [
    { operation: "merge", parameters: { generateToc: true } },
    { operation: "compress", parameters: { compressionLevel: 3 } },
  ],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z",
};

describe("automationConverter", () => {
  describe("convertToAutomationConfig", () => {
    test("strips id/createdAt/updatedAt and clones parameters", () => {
      const result = convertToAutomationConfig(sampleAutomation);
      expect(result).toEqual({
        name: "Sample",
        description: "Test automation",
        icon: "CompressIcon",
        operations: [
          { operation: "merge", parameters: { generateToc: true } },
          { operation: "compress", parameters: { compressionLevel: 3 } },
        ],
      });
      expect(result).not.toHaveProperty("id");
      expect(result).not.toHaveProperty("createdAt");
      expect(result).not.toHaveProperty("updatedAt");
      // Parameters should be cloned, not the same reference.
      expect(result.operations[0].parameters).not.toBe(
        sampleAutomation.operations[0].parameters,
      );
    });
  });

  describe("convertToFolderScanningConfig", () => {
    test("rewrites operation keys to backend endpoints and adds fileInput", () => {
      const config = convertToFolderScanningConfig(sampleAutomation, registry);
      expect(config.pipeline).toEqual([
        {
          operation: "/api/v1/general/merge-pdfs",
          parameters: { generateToc: true, fileInput: "automated" },
        },
        {
          operation: "/api/v1/misc/compress-pdf",
          parameters: { compressionLevel: 3, fileInput: "automated" },
        },
      ]);
    });

    test("preserves icon and description so round-tripping keeps UI metadata", () => {
      const config = convertToFolderScanningConfig(sampleAutomation, registry);
      expect(config.icon).toBe("CompressIcon");
      expect(config.description).toBe("Test automation");
    });

    test("omits icon and description when not set on the source automation", () => {
      const minimal: AutomationConfig = {
        id: "min",
        name: "Minimal",
        operations: [{ operation: "merge", parameters: {} }],
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      };
      const config = convertToFolderScanningConfig(minimal, registry);
      expect(config).not.toHaveProperty("icon");
      expect(config).not.toHaveProperty("description");
    });

    test("falls back to operation key when no endpoint is registered", () => {
      const automation: AutomationConfig = {
        ...sampleAutomation,
        operations: [{ operation: "unknownTool", parameters: {} }],
      };
      const config = convertToFolderScanningConfig(automation, registry);
      expect(config.pipeline[0].operation).toBe("unknownTool");
    });
  });

  describe("detectAutomationFormat", () => {
    test("detects native Automate JSON", () => {
      expect(detectAutomationFormat({ operations: [] })).toBe("automate");
    });
    test("detects folder-scanning JSON", () => {
      expect(detectAutomationFormat({ pipeline: [] })).toBe("folderScanning");
    });
    test("returns unknown for ambiguous or invalid input", () => {
      expect(detectAutomationFormat({ pipeline: [], operations: [] })).toBe(
        "unknown",
      );
      expect(detectAutomationFormat(null)).toBe("unknown");
      expect(detectAutomationFormat("string")).toBe("unknown");
    });
  });

  describe("parseAutomationConfigJson", () => {
    test("accepts a previously exported native Automate JSON", () => {
      const exported = convertToAutomationConfig(sampleAutomation);
      const parsed = parseAutomationConfigJson(exported, registry);
      expect(parsed.unresolvedOperations).toEqual([]);
      expect(parsed.automation.name).toBe("Sample");
      expect(parsed.automation.operations).toHaveLength(2);
      expect(parsed.automation.operations[0].operation).toBe("merge");
      // Icon must round-trip — losing it makes saved entries fall back to the
      // settings cog, which historically looked like a silent picker bug.
      expect(parsed.automation.icon).toBe("CompressIcon");
    });

    test("flags operations not present in the registry", () => {
      const result = parseAutomationConfigJson(
        {
          name: "x",
          operations: [{ operation: "notARealTool", parameters: {} }],
        },
        registry,
      );
      expect(result.unresolvedOperations).toEqual(["notARealTool"]);
    });

    test("throws on missing operations array", () => {
      expect(() => parseAutomationConfigJson({ name: "x" }, registry)).toThrow(
        /operations/,
      );
    });
  });

  describe("parseFolderScanningConfig", () => {
    test("round-trips a folder-scan export back to tool IDs", () => {
      const exported = convertToFolderScanningConfig(
        sampleAutomation,
        registry,
      );
      const parsed = parseFolderScanningConfig(exported, registry);
      expect(parsed.unresolvedOperations).toEqual([]);
      expect(parsed.automation.operations.map((o) => o.operation)).toEqual([
        "merge",
        "compress",
      ]);
      // Icon survives the round trip even through the folder-scan format.
      expect(parsed.automation.icon).toBe("CompressIcon");
      // The export-time `fileInput: "automated"` marker must not survive import.
      for (const op of parsed.automation.operations) {
        expect(op.parameters).not.toHaveProperty("fileInput");
      }
    });

    test("resolves a dynamic endpoint by replaying it with the imported parameters", () => {
      const config = {
        name: "Convert",
        pipeline: [
          {
            operation: "/api/v1/convert/pdf-to-docx",
            parameters: {
              fromExtension: "pdf",
              toExtension: "docx",
              fileInput: "automated",
            },
          },
        ],
      };
      const parsed = parseFolderScanningConfig(config, registry);
      expect(parsed.unresolvedOperations).toEqual([]);
      expect(parsed.automation.operations[0].operation).toBe("convert");
      expect(parsed.automation.operations[0].parameters).toEqual({
        fromExtension: "pdf",
        toExtension: "docx",
      });
    });

    test("keeps unmappable endpoints verbatim and reports them", () => {
      const config = {
        name: "Mystery",
        pipeline: [{ operation: "/api/v1/unknown/op", parameters: {} }],
      };
      const parsed = parseFolderScanningConfig(config, registry);
      expect(parsed.unresolvedOperations).toEqual(["/api/v1/unknown/op"]);
      expect(parsed.automation.operations[0].operation).toBe(
        "/api/v1/unknown/op",
      );
    });

    test("throws on missing pipeline array", () => {
      expect(() => parseFolderScanningConfig({ name: "x" }, registry)).toThrow(
        /pipeline/,
      );
    });
  });

  describe("parseAutomationFile", () => {
    test("auto-detects Automate JSON", () => {
      const text = JSON.stringify({
        name: "x",
        operations: [{ operation: "merge", parameters: {} }],
      });
      const result = parseAutomationFile(text, registry);
      expect(result.format).toBe("automate");
    });

    test("auto-detects Folder Scanning JSON", () => {
      const text = JSON.stringify({
        name: "x",
        pipeline: [{ operation: "/api/v1/general/merge-pdfs", parameters: {} }],
      });
      const result = parseAutomationFile(text, registry);
      expect(result.format).toBe("folderScanning");
    });

    test("rejects mismatched explicit format", () => {
      const text = JSON.stringify({
        name: "x",
        operations: [{ operation: "merge", parameters: {} }],
      });
      expect(() =>
        parseAutomationFile(text, registry, "folderScanning"),
      ).toThrow();
    });

    test("rejects malformed JSON", () => {
      expect(() => parseAutomationFile("{ not json", registry)).toThrow(
        /not valid JSON/,
      );
    });

    test("rejects unrecognized shape", () => {
      expect(() =>
        parseAutomationFile(JSON.stringify({ foo: "bar" }), registry),
      ).toThrow(/Unrecognized JSON/);
    });
  });
});
