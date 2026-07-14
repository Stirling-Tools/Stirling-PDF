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
  stepRequiresUpload,
  type WorkingToolStep,
} from "@app/hooks/tools/shared/toolAutomation";
import { compressOperationConfig } from "@app/hooks/tools/compress/useCompressOperation";
import { defaultParameters as compressDefaults } from "@app/hooks/tools/compress/useCompressParameters";
import { splitOperationConfig } from "@app/hooks/tools/split/useSplitOperation";
import { SPLIT_METHODS } from "@app/constants/splitConstants";
import { redactOperationConfig } from "@app/hooks/tools/redact/useRedactOperation";

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

// Separate registry so these don't change the getExecutableTools expectations above.
const dynamicRegistry: Partial<ToolRegistry> = {
  split: entry({
    name: "Split",
    automationSettings: NoopSettings,
    operationConfig: asRegistryConfig(splitOperationConfig),
  }),
  redact: entry({
    name: "Redact",
    automationSettings: NoopSettings,
    operationConfig: asRegistryConfig(redactOperationConfig),
  }),
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

  test("a dynamic-endpoint tool (split by chapters) round-trips as an editable step", () => {
    const step: WorkingToolStep = {
      toolId: "split" as ToolId,
      operation: "/api/v1/general/split-pdf-by-chapters",
      params: { method: SPLIT_METHODS.BY_CHAPTERS, bookmarkLevel: "2" },
      support: "editable",
    };

    const api = serializeToolStep(step, dynamicRegistry);
    expect(api.operation).toBe("/api/v1/general/split-pdf-by-chapters");
    expect(api.parameters).toMatchObject({ bookmarkLevel: 2 });

    // No `method` in the stored body, so this only matches via the declared endpoint set.
    const back = deserializeToolStep(api, dynamicRegistry);
    expect(back.toolId).toBe("split");
    expect(back.support).toBe("editable");
    expect(back.operation).toBe("/api/v1/general/split-pdf-by-chapters");
    expect(back.params).toMatchObject({ method: SPLIT_METHODS.BY_CHAPTERS });
  });

  test("a dynamic-endpoint tool whose routing field is dropped (redact) stays editable", () => {
    const step: WorkingToolStep = {
      toolId: "redact" as ToolId,
      operation: "/api/v1/security/auto-redact",
      params: { mode: "automatic", wordsToRedact: ["secret"] },
      support: "editable",
    };

    const api = serializeToolStep(step, dynamicRegistry);
    expect(api.operation).toBe("/api/v1/security/auto-redact");
    expect(api.parameters).not.toHaveProperty("mode");

    // No `mode` in the body, so it only matches via the declared set (replay would yield null).
    const back = deserializeToolStep(api, dynamicRegistry);
    expect(back.toolId).toBe("redact");
    expect(back.support).toBe("editable");
    expect(back.operation).toBe("/api/v1/security/auto-redact");
    expect(back.params).toMatchObject({ mode: "automatic" });
  });
});

describe("stepRequiresUpload", () => {
  const step = (params: Record<string, unknown>): WorkingToolStep => ({
    toolId: "compress" as ToolId,
    operation: "/api/v1/misc/compress-pdf",
    params,
    support: "editable",
  });

  test("detects a File (or list of Files) among the parameters", () => {
    const image = new File(["x"], "logo.png", { type: "image/png" });
    expect(stepRequiresUpload(step({ level: 5 }))).toBe(false);
    expect(stepRequiresUpload(step({ watermarkImage: image }))).toBe(true);
    expect(stepRequiresUpload(step({ attachments: [image] }))).toBe(true);
  });
});
