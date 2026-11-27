// @vitest-environment node
/**
 * Unit tests for automationConverter import/export round-tripping.
 */

import { describe, test, expect } from "vitest";
import { expectConsole } from "@editor/tests/failOnConsole";
import {
  convertToAutomationConfig,
  convertToFolderScanningConfig,
  detectAutomationFormat,
  parseAutomationConfigJson,
  parseAutomationFile,
  parseFolderScanningConfig,
} from "@editor/utils/automationConverter";
import { AutomationConfig } from "@editor/types/automation";
import type { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { asRegistryConfig } from "@editor/hooks/tools/shared/toolOperationTypes";
import { compressOperationConfig } from "@editor/hooks/tools/compress/useCompressOperation";
import { splitOperationConfig } from "@editor/hooks/tools/split/useSplitOperation";
import { convertOperationConfig } from "@editor/hooks/tools/convert/useConvertOperation";
import { defaultParameters as convertDefaults } from "@editor/hooks/tools/convert/useConvertParameters";
import { SPLIT_METHODS } from "@editor/constants/splitConstants";

// Minimal stub registry of tools with no API mappers, so their frontend
// parameters pass through the export unchanged.
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
} as unknown as Partial<ToolRegistry>;

// Real tool configs, so the export and import run each tool's own mappers.
const mappedRegistry = {
  compress: { operationConfig: asRegistryConfig(compressOperationConfig) },
  split: { operationConfig: asRegistryConfig(splitOperationConfig) },
  convert: { operationConfig: asRegistryConfig(convertOperationConfig) },
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
      expectConsole.warn(/No endpoint found for operation "unknownTool"/);
      const automation: AutomationConfig = {
        ...sampleAutomation,
        operations: [{ operation: "unknownTool", parameters: {} }],
      };
      const config = convertToFolderScanningConfig(automation, registry);
      expect(config.pipeline[0].operation).toBe("unknownTool");
    });

    test("exports the backend request fields a mapped tool's endpoint takes", () => {
      // The backend runs folder-scan steps without the frontend, so it must
      // receive optimizeLevel, not the settings UI's compressionLevel.
      const automation: AutomationConfig = {
        ...sampleAutomation,
        operations: [
          { operation: "compress", parameters: { compressionLevel: 9 } },
        ],
      };
      const config = convertToFolderScanningConfig(automation, mappedRegistry);
      expect(config.pipeline[0].operation).toBe("/api/v1/misc/compress-pdf");
      expect(config.pipeline[0].parameters).toMatchObject({
        optimizeLevel: 9,
        fileInput: "automated",
      });
      expect(config.pipeline[0].parameters).not.toHaveProperty(
        "compressionLevel",
      );
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

    test("reads a backend step back into the tool's frontend parameters", () => {
      const config = {
        name: "Convert",
        pipeline: [
          {
            operation: "/api/v1/convert/pdf/word",
            parameters: {
              fromExtension: "pdf",
              toExtension: "docx",
              outputFormat: "docx",
              fileInput: "automated",
            },
          },
        ],
      };
      const parsed = parseFolderScanningConfig(config, mappedRegistry);
      expect(parsed.unresolvedOperations).toEqual([]);
      expect(parsed.automation.operations[0].operation).toBe("convert");
      expect(parsed.automation.operations[0].parameters).toMatchObject({
        ...convertDefaults,
        fromExtension: "pdf",
        toExtension: "docx",
      });
    });

    test("round-trips a mapped tool through its backend request shape", () => {
      const automation: AutomationConfig = {
        ...sampleAutomation,
        operations: [
          { operation: "compress", parameters: { compressionLevel: 9 } },
        ],
      };
      const exported = convertToFolderScanningConfig(
        automation,
        mappedRegistry,
      );
      const parsed = parseFolderScanningConfig(exported, mappedRegistry);
      expect(parsed.automation.operations[0].operation).toBe("compress");
      expect(parsed.automation.operations[0].parameters).toMatchObject({
        compressionLevel: 9,
      });
    });

    test("round-trips a tool whose endpoint depends on a frontend-only field", () => {
      // Split's method picks the endpoint and never reaches the backend body,
      // so the import has to recover it from the endpoint and fields present.
      const automation: AutomationConfig = {
        ...sampleAutomation,
        operations: [
          {
            operation: "split",
            parameters: { method: SPLIT_METHODS.BY_SIZE, splitValue: "10MB" },
          },
        ],
      };
      const exported = convertToFolderScanningConfig(
        automation,
        mappedRegistry,
      );
      expect(exported.pipeline[0]).toEqual({
        operation: "/api/v1/general/split-by-size-or-count",
        parameters: {
          splitType: 0,
          splitValue: "10MB",
          fileInput: "automated",
        },
      });
      const parsed = parseFolderScanningConfig(exported, mappedRegistry);
      expect(parsed.unresolvedOperations).toEqual([]);
      expect(parsed.automation.operations[0].operation).toBe("split");
      expect(parsed.automation.operations[0].parameters).toMatchObject({
        method: SPLIT_METHODS.BY_SIZE,
        splitValue: "10MB",
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
