import { describe, expect, it } from "vitest";
import { isConditionComplete } from "@editor/conditions/validation";
import {
  classificationCondition,
  requiresClassification,
} from "@editor/data/classificationConditions";
import type { Condition } from "@editor/conditions/types";

describe("document conditions", () => {
  it("requires classification only for classifier-produced facts", () => {
    const extension: Condition = {
      input: { source: "document", field: "document.extension" },
      operator: "matches-any",
      values: ["docx"],
    };

    expect(isConditionComplete(extension)).toBe(true);
    expect(requiresClassification(extension)).toBe(false);
    expect(requiresClassification(classificationCondition(["invoice"]))).toBe(
      true,
    );
  });

  it("rejects blank operands and accepts meaningful values with surrounding whitespace", () => {
    expect(isConditionComplete(classificationCondition())).toBe(false);
    expect(isConditionComplete(classificationCondition([" "]))).toBe(false);
    expect(isConditionComplete(classificationCondition([" Invoice "]))).toBe(
      true,
    );
  });
});
