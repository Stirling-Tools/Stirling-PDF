import { describe, it, expect } from "vitest";
import { POLICY_CATEGORIES, POLICY_CONFIG } from "@app/data/policyDefinitions";

describe("policy definitions integrity", () => {
  it("every category has a matching config entry", () => {
    for (const cat of POLICY_CATEGORIES) {
      expect(POLICY_CONFIG[cat.id], `config for ${cat.id}`).toBeDefined();
      // A category may have no policy-level setting fields; fields is required
      // but can be empty.
      expect(Array.isArray(POLICY_CONFIG[cat.id].fields)).toBe(true);
      expect(POLICY_CONFIG[cat.id].rules.length).toBeGreaterThan(0);
      // Every preset seeds a real, non-empty pipeline (the category→steps map).
      expect(
        POLICY_CONFIG[cat.id].defaultOperations.length,
        `defaultOperations for ${cat.id}`,
      ).toBeGreaterThan(0);
    }
  });
  it("field keys are unique within each category", () => {
    for (const cat of POLICY_CATEGORIES) {
      const keys = POLICY_CONFIG[cat.id].fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
