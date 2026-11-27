import { describe, expect, test } from "vitest";
import {
  ToolCategoryId,
  SubcategoryId,
  type ToolRegistry,
  type ToolRegistryEntry,
} from "@editor/data/toolsTaxonomy";
import { asRegistryConfig } from "@editor/hooks/tools/shared/toolOperationTypes";
import { compressOperationConfig } from "@editor/hooks/tools/compress/useCompressOperation";
import { automationToPipelineDraft } from "@editor/hooks/tools/automate/useOpenAsPipeline";
import type { AutomationConfig } from "@editor/types/automation";

function entry(over: Partial<ToolRegistryEntry>): ToolRegistryEntry {
  return {
    icon: null,
    name: "",
    component: null,
    description: "",
    categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
    subcategoryId: SubcategoryId.GENERAL,
    automationSettings: () => null,
    ...over,
  };
}

const registry: Partial<ToolRegistry> = {
  compress: entry({
    name: "Compress",
    operationConfig: asRegistryConfig(compressOperationConfig),
  }),
};

function automation(
  operations: AutomationConfig["operations"],
): AutomationConfig {
  return {
    id: "a1",
    name: "Shrink it",
    operations,
    createdAt: "",
    updatedAt: "",
  };
}

describe("automationToPipelineDraft", () => {
  test("carries the name and each step's settings, with no source or destination", () => {
    const draft = automationToPipelineDraft(
      automation([
        { operation: "compress", parameters: { compressionLevel: 9 } },
      ]),
      registry,
    );

    expect(draft).toMatchObject({
      name: "Shrink it",
      enabled: true,
      inputs: [],
      outputIds: [],
      output: { type: "inline", options: {} },
    });
    expect(draft?.steps).toHaveLength(1);
    expect(draft?.steps[0].operation).toBe("/api/v1/misc/compress-pdf");
    expect(draft?.steps[0].parameters).toMatchObject({ optimizeLevel: 9 });
  });

  test("refuses an automation with a step the Processor cannot run", () => {
    expect(
      automationToPipelineDraft(
        automation([
          { operation: "compress", parameters: {} },
          { operation: "notATool", parameters: {} },
        ]),
        registry,
      ),
    ).toBeNull();
    expect(automationToPipelineDraft(automation([]), registry)).toBeNull();
  });
});
