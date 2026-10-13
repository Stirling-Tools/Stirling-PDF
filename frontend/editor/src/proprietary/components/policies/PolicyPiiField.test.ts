import { describe, expect, it } from "vitest";
import { LEGACY_PII_PATTERNS, PII_PRESETS } from "@app/data/policyDefinitions";
import { PRESET_PATTERNS } from "@app/components/policies/PolicyPiiField";

describe("PRESET_PATTERNS", () => {
  it("treats a preset's legacy form as a preset, so re-saving replaces it", () => {
    const legacy = Object.values(LEGACY_PII_PATTERNS).flat();
    expect(legacy.length).toBeGreaterThan(0);
    for (const pattern of legacy) {
      expect(PRESET_PATTERNS.has(pattern)).toBe(true);
    }
    for (const preset of PII_PRESETS) {
      expect(PRESET_PATTERNS.has(preset.pattern)).toBe(true);
    }
  });
});
