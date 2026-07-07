import { describe, expect, test } from "vitest";
import {
  ToolCategoryId,
  SubcategoryId,
  type ToolRegistry,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import { type ToolId } from "@app/types/toolId";
import {
  asRegistryConfig,
  ToolType,
} from "@app/hooks/tools/shared/toolOperationTypes";
import {
  deserializeToolStep,
  getExecutableTools,
  serializeToolStep,
  type WorkingToolStep,
} from "@app/hooks/tools/shared/toolAutomation";
import { compressOperationConfig } from "@app/hooks/tools/compress/useCompressOperation";
import { defaultParameters as compressDefaults } from "@app/hooks/tools/compress/useCompressParameters";

function entry(over: Partial<ToolRegistryEntry>): ToolRegistryEntry {
  return {
    icon: null,
    name: "",
    component: null,
    description: "",
    categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
    subcategoryId: SubcategoryId.GENERAL,
    automationSettings: null,
    ...over,
  };
}

const NoopSettings = () => null;

// A migrated, param-less config (mappers present, no settings UI) -> "noSettings".
const repairConfig = asRegistryConfig({
  toolType: ToolType.singleFile,
  operationType: "repair",
  endpoint: "/api/v1/misc/repair",
  defaultParameters: {},
  buildFormData: () => new FormData(),
  toApiParams: () => ({}),
  fromApiParams: () => ({}),
});

// A config with no mappers (not migrated) -> "unsupported".
const changeMetadataConfig = asRegistryConfig({
  toolType: ToolType.singleFile,
  operationType: "changeMetadata",
  endpoint: "/api/v1/misc/update-metadata",
  defaultParameters: {},
  buildFormData: () => new FormData(),
});

const registry: Partial<ToolRegistry> = {
  compress: entry({
    name: "Compress",
    automationSettings: NoopSettings,
    operationConfig: asRegistryConfig(compressOperationConfig),
  }),
  repair: entry({ name: "Repair", operationConfig: repairConfig }),
  changeMetadata: entry({
    name: "Change metadata",
    automationSettings: NoopSettings,
    operationConfig: changeMetadataConfig,
  }),
  // Excluded: automation explicitly off.
  sign: entry({
    name: "Sign",
    supportsAutomate: false,
    operationConfig: repairConfig,
  }),
  // Excluded: no operationConfig at all.
  extractPages: entry({ name: "Extract pages" }),
};

describe("getExecutableTools", () => {
  test("lists automatable tools with a resolvable endpoint, classified by support", () => {
    const tools = getExecutableTools(registry);
    expect(tools.map((t) => t.toolId)).toEqual([
      "changeMetadata",
      "compress",
      "repair",
    ]);
    expect(Object.fromEntries(tools.map((t) => [t.toolId, t.support]))).toEqual(
      {
        compress: "editable",
        repair: "noSettings",
        changeMetadata: "unsupported",
      },
    );
  });
});

describe("serialize/deserialize round-trip", () => {
  test("compress maps UI params to the backend body and back", () => {
    const step: WorkingToolStep = {
      toolId: "compress" as ToolId,
      operation: "/api/v1/misc/compress-pdf",
      params: {
        ...compressDefaults,
        compressionLevel: 7,
        compressionMethod: "filesize",
        fileSizeValue: "2",
        fileSizeUnit: "MB",
      },
      support: "editable",
    };

    const api = serializeToolStep(step, registry);
    expect(api.operation).toBe("/api/v1/misc/compress-pdf");
    expect(api.parameters).toMatchObject({
      optimizeLevel: 7,
      expectedOutputSize: "2MB",
    });

    const back = deserializeToolStep(api, registry);
    expect(back.toolId).toBe("compress");
    expect(back.params).toMatchObject({
      compressionLevel: 7,
      compressionMethod: "filesize",
      fileSizeValue: "2",
      fileSizeUnit: "MB",
    });
  });

  test("an unknown endpoint is preserved as an unmapped step", () => {
    const step = deserializeToolStep(
      { operation: "/api/v1/unknown/thing", parameters: { keep: true } },
      registry,
    );
    expect(step.toolId).toBeNull();
    expect(step.support).toBe("unknown");
    expect(serializeToolStep(step, registry)).toEqual({
      operation: "/api/v1/unknown/thing",
      parameters: { keep: true },
    });
  });
});
