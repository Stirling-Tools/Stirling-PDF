import { describe, expect, test } from "vitest";
import { policyStep } from "@app/policies/operations";
import { isPolicyStepConfigured } from "@app/policies/stepValidity";

describe("isPolicyStepConfigured", () => {
  test("a text watermark needs non-blank text", () => {
    expect(
      isPolicyStepConfigured(policyStep("watermark", { watermarkText: "" })),
    ).toBe(false);
    expect(
      isPolicyStepConfigured(policyStep("watermark", { watermarkText: "   " })),
    ).toBe(false);
    expect(
      isPolicyStepConfigured(
        policyStep("watermark", { watermarkText: "Confidential" }),
      ),
    ).toBe(true);
  });

  test("an image watermark is valid without text", () => {
    expect(
      isPolicyStepConfigured(
        policyStep("watermark", { watermarkType: "image", watermarkText: "" }),
      ),
    ).toBe(true);
  });

  test("a redact step needs at least one pattern", () => {
    expect(
      isPolicyStepConfigured(policyStep("redact", { wordsToRedact: [] })),
    ).toBe(false);
    expect(
      isPolicyStepConfigured(
        policyStep("redact", { wordsToRedact: ["\\d{3}-\\d{2}-\\d{4}"] }),
      ),
    ).toBe(true);
  });

  test("integration steps need their connection", () => {
    for (const toolId of [
      "purviewApplyLabel",
      "purviewReadLabel",
      "externalApiCall",
    ] as const) {
      expect(isPolicyStepConfigured(policyStep(toolId))).toBe(false);
      expect(
        isPolicyStepConfigured(policyStep(toolId, { connectionId: "conn-1" })),
      ).toBe(true);
    }
  });

  test("tools with no rule are always valid", () => {
    expect(isPolicyStepConfigured(policyStep("sanitize"))).toBe(true);
    expect(isPolicyStepConfigured(policyStep("compress"))).toBe(true);
  });
});
