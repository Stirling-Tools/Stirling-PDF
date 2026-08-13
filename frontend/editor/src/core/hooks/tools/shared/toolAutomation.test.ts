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
import { autoRotateOperationConfig } from "@app/hooks/tools/autoRotate/useAutoRotateOperation";
import { defaultParameters as autoRotateDefaults } from "@app/hooks/tools/autoRotate/useAutoRotateParameters";
import { addPasswordOperationConfig } from "@app/hooks/tools/addPassword/useAddPasswordOperation";
import { changePermissionsOperationConfig } from "@app/hooks/tools/changePermissions/useChangePermissionsOperation";
import { convertOperationConfig } from "@app/hooks/tools/convert/useConvertOperation";
import { defaultParameters as convertDefaults } from "@app/hooks/tools/convert/useConvertParameters";

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
  autoRotate: entry({
    name: "Auto Rotate",
    automationSettings: NoopSettings,
    operationConfig: asRegistryConfig(autoRotateOperationConfig),
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

  test("a stored step missing fields falls back to defaults, not undefined", () => {
    // Mappers echo absent stored fields as explicit undefined; settings UIs
    // then crash on things like keyLength.toString(). Defaults must win.
    const back = deserializeToolStep(
      { operation: "/api/v1/misc/compress-pdf", parameters: {} },
      registry,
    );
    expect(back.params.compressionLevel).toBe(
      compressDefaults.compressionLevel,
    );
    expect(
      Object.values(back.params).every((value) => value !== undefined),
    ).toBe(true);
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

  test("auto rotate carries its detection settings into the backend step", () => {
    // A custom-processor tool: the browser applies the rotations, but a backend
    // pipeline still has to receive the detection settings, which only happens
    // because the config declares mappers.
    const step: WorkingToolStep = {
      toolId: "autoRotate" as ToolId,
      operation: "/api/v1/misc/auto-rotate-pdf",
      params: {
        ...autoRotateDefaults,
        detectionMode: "osd",
        confidenceThreshold: 20,
        inferUndetected: false,
      },
      support: "editable",
    };

    const api = serializeToolStep(step, dynamicRegistry);
    expect(api.operation).toBe("/api/v1/misc/auto-rotate-pdf");
    expect(api.parameters).toEqual({
      detectionMode: "osd",
      confidenceThreshold: 20,
      inferUndetected: false,
    });

    const back = deserializeToolStep(api, dynamicRegistry);
    expect(back.toolId).toBe("autoRotate");
    expect(back.support).toBe("editable");
    expect(back.params).toMatchObject({
      detectionMode: "osd",
      confidenceThreshold: 20,
      inferUndetected: false,
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

describe("shared-endpoint disambiguation", () => {
  const addPassword = entry({
    name: "Add Password",
    automationSettings: NoopSettings,
    operationConfig: asRegistryConfig(addPasswordOperationConfig),
  });
  const changePermissions = entry({
    name: "Change Permissions",
    automationSettings: NoopSettings,
    operationConfig: asRegistryConfig(changePermissionsOperationConfig),
  });
  const ADD_PASSWORD = "/api/v1/security/add-password";

  // Permissions only, no encryption fields: this is Change Permissions.
  const permsOnly = {
    operation: ADD_PASSWORD,
    parameters: { preventPrinting: true },
  };
  // Carries keyLength (and a password): this is Add Password, even with a blank owner password.
  const withPassword = {
    operation: ADD_PASSWORD,
    parameters: { password: "s3cret", ownerPassword: "", keyLength: 256 },
  };

  // Both share an endpoint, so the wrong one would win by registry order without a discriminator.
  for (const [label, registry] of [
    ["add-password declared first", { addPassword, changePermissions }],
    ["change-permissions declared first", { changePermissions, addPassword }],
  ] as const) {
    test(`each stored step reloads as its own tool (${label})`, () => {
      expect(deserializeToolStep(permsOnly, registry).toolId).toBe(
        "changePermissions",
      );
      expect(deserializeToolStep(withPassword, registry).toolId).toBe(
        "addPassword",
      );
    });
  }
});

describe("convert (format-routed custom tool)", () => {
  const convertRegistry: Partial<ToolRegistry> = {
    convert: entry({
      name: "Convert",
      automationSettings: NoopSettings,
      operationConfig: asRegistryConfig(convertOperationConfig),
    }),
  };

  test("is offered as an editable step despite an unresolved default endpoint", () => {
    const tools = getExecutableTools(convertRegistry);
    expect(tools.map((t) => t.toolId)).toEqual(["convert"]);
    expect(tools[0].support).toBe("editable");
    // Its from/to are unset by default, so a representative endpoint stands in for the picker.
    expect(tools[0].endpoint).toBe("/api/v1/convert/file/pdf");
    expect(tools[0].endpoints).toContain("/api/v1/convert/pdf/word");
  });

  test("round-trips a PDF -> Word step, carrying from/to and the output format", () => {
    const step: WorkingToolStep = {
      toolId: "convert" as ToolId,
      operation: "/api/v1/convert/file/pdf",
      params: { ...convertDefaults, fromExtension: "pdf", toExtension: "docx" },
      support: "editable",
    };

    const api = serializeToolStep(step, convertRegistry);
    expect(api.operation).toBe("/api/v1/convert/pdf/word");
    expect(api.parameters).toMatchObject({
      fromExtension: "pdf",
      toExtension: "docx",
      outputFormat: "docx",
    });

    const back = deserializeToolStep(api, convertRegistry);
    expect(back.toolId).toBe("convert");
    expect(back.support).toBe("editable");
    expect(back.operation).toBe("/api/v1/convert/pdf/word");
    expect(back.params).toMatchObject({
      fromExtension: "pdf",
      toExtension: "docx",
    });
  });

  test("round-trips a PDF -> image step, restoring the image options", () => {
    const step: WorkingToolStep = {
      toolId: "convert" as ToolId,
      operation: "/api/v1/convert/file/pdf",
      params: {
        ...convertDefaults,
        fromExtension: "pdf",
        toExtension: "png",
        imageOptions: { ...convertDefaults.imageOptions, dpi: 600 },
      },
      support: "editable",
    };

    const api = serializeToolStep(step, convertRegistry);
    expect(api.operation).toBe("/api/v1/convert/pdf/img");
    expect(api.parameters).toMatchObject({ imageFormat: "png", dpi: "600" });

    const back = deserializeToolStep(api, convertRegistry);
    expect(back.operation).toBe("/api/v1/convert/pdf/img");
    expect(back.params).toMatchObject({
      toExtension: "png",
      imageOptions: { dpi: 600 },
    });
  });

  test("round-trips an image -> PDF step, restoring the from-image options", () => {
    const step: WorkingToolStep = {
      toolId: "convert" as ToolId,
      operation: "/api/v1/convert/file/pdf",
      params: {
        ...convertDefaults,
        fromExtension: "png",
        toExtension: "pdf",
        imageOptions: {
          ...convertDefaults.imageOptions,
          fitOption: "fillPage",
          autoRotate: false,
        },
      },
      support: "editable",
    };

    const api = serializeToolStep(step, convertRegistry);
    expect(api.operation).toBe("/api/v1/convert/img/pdf");
    expect(api.parameters).toMatchObject({
      fitOption: "fillPage",
      autoRotate: "false",
    });

    const back = deserializeToolStep(api, convertRegistry);
    expect(back.params).toMatchObject({
      imageOptions: { fitOption: "fillPage", autoRotate: false },
    });
  });

  test("round-trips a PDF -> PDF/UA step, restoring every accessibility option", () => {
    const step: WorkingToolStep = {
      toolId: "convert" as ToolId,
      operation: "/api/v1/convert/file/pdf",
      params: {
        ...convertDefaults,
        fromExtension: "pdf",
        toExtension: "pdfua",
        pdfUaOptions: {
          profile: "ua2",
          language: "fr-FR",
          overrideLanguage: true,
          title: "Rapport annuel",
          embedFonts: false,
          altText: "0:12=Graphique des revenus",
        },
      },
      support: "editable",
    };

    const api = serializeToolStep(step, convertRegistry);
    expect(api.operation).toBe("/api/v1/convert/pdf/ua");
    expect(api.parameters).toMatchObject({
      profile: "ua2",
      language: "fr-FR",
      overrideLanguage: "true",
      title: "Rapport annuel",
      embedFonts: "false",
      altText: "0:12=Graphique des revenus",
    });

    const back = deserializeToolStep(api, convertRegistry);
    expect(back.operation).toBe("/api/v1/convert/pdf/ua");
    expect(back.params).toMatchObject({
      toExtension: "pdfua",
      pdfUaOptions: {
        profile: "ua2",
        language: "fr-FR",
        overrideLanguage: true,
        title: "Rapport annuel",
        embedFonts: false,
        altText: "0:12=Graphique des revenus",
      },
    });
  });

  test("routes PDF/X through the shared PDF/A endpoint and recovers the PDF/X target", () => {
    const step: WorkingToolStep = {
      toolId: "convert" as ToolId,
      operation: "/api/v1/convert/file/pdf",
      params: { ...convertDefaults, fromExtension: "pdf", toExtension: "pdfx" },
      support: "editable",
    };

    const api = serializeToolStep(step, convertRegistry);
    // PDF/X has no endpoint of its own; it rides the PDF/A endpoint, distinguished by the bookkeeping.
    expect(api.operation).toBe("/api/v1/convert/pdf/pdfa");
    expect(api.parameters).toMatchObject({ toExtension: "pdfx" });

    const back = deserializeToolStep(api, convertRegistry);
    expect(back.operation).toBe("/api/v1/convert/pdf/pdfa");
    expect(back.params).toMatchObject({
      toExtension: "pdfx",
      pdfxOptions: { outputFormat: "pdfx" },
    });
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
