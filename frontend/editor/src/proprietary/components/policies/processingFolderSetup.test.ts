import { describe, expect, it } from "vitest";
import {
  canEditFolderSteps,
  folderSetupEntry,
  mergeFolderSteps,
} from "@app/components/policies/processingFolderSetup";
import { policyStepFromWire, policyStepToWire } from "@app/policies/operations";
import type { ProcessingRecordSummary } from "@app/hooks/useProcessingFolders";

const saved: ProcessingRecordSummary = {
  id: "processing-1",
  enabled: false,
  steps: [
    {
      operation: "/api/v1/misc/compress-pdf",
      parameters: { optimizeLevel: "3", customServerOption: "keep" },
      assets: { reference: "asset-1" },
    },
    {
      operation: "/api/v1/security/sanitize-pdf",
      parameters: { removeJavaScript: true },
    },
  ],
};

describe("folder processing edits", () => {
  it("retains saved tool order across preset boundaries and the paused state", () => {
    const entry = folderSetupEntry("security", saved);
    expect(entry.config.defaultOperations.map((step) => step.toolId)).toEqual([
      "compress",
      "sanitize",
    ]);
    expect(entry.policy?.state.status).toBe("paused");
  });

  it("preserves assets and unmodelled parameters when serialising edited steps", () => {
    const parsed = policyStepFromWire(saved.steps[0]);
    if (!parsed || parsed.toolId !== "compress")
      throw new Error("Expected compression parameters");
    const result = mergeFolderSteps(saved, [policyStepToWire(parsed)]);
    expect(result).toHaveLength(1);
    expect(result[0].assets).toEqual({ reference: "asset-1" });
    expect(result[0].parameters).toMatchObject({ customServerOption: "keep" });
  });

  it("keeps the matching preset's omitted tools available when reopening a folder", () => {
    const entry = folderSetupEntry("classification", {
      ...saved,
      steps: [saved.steps[1]],
    });
    expect(entry.category.id).toBe("security");
    expect(entry.config.defaultOperations.map((step) => step.toolId)).toEqual([
      "sanitize",
      "redact",
      "watermark",
    ]);
    expect(entry.policy?.steps).toEqual([saved.steps[1]]);
  });

  it("refuses unknown or repeated tools so the simple editor cannot silently discard them", () => {
    expect(canEditFolderSteps(saved)).toBe(true);
    expect(
      canEditFolderSteps({ ...saved, steps: [...saved.steps, saved.steps[0]] }),
    ).toBe(false);
    expect(
      canEditFolderSteps({
        ...saved,
        steps: [{ operation: "/custom-tool", parameters: {} }],
      }),
    ).toBe(false);
  });
});
