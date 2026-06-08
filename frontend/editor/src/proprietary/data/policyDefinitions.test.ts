import { describe, it, expect } from "vitest";
import {
  canConfigurePolicies,
  POLICY_CATEGORIES,
  POLICY_CONFIG,
} from "@app/data/policyDefinitions";
import type { PolicyUser } from "@app/types/policies";

const base: PolicyUser = {
  name: "X",
  email: "x@y.com",
  initials: "X",
  role: "member",
  hasOrg: true,
  policyPermission: false,
};

describe("canConfigurePolicies", () => {
  it("solo users (no org) always have access", () => {
    expect(canConfigurePolicies({ ...base, hasOrg: false })).toBe(true);
  });
  it("owners and admins have access", () => {
    expect(canConfigurePolicies({ ...base, role: "owner" })).toBe(true);
    expect(canConfigurePolicies({ ...base, role: "admin" })).toBe(true);
  });
  it("members are gated on explicit permission", () => {
    expect(canConfigurePolicies({ ...base, policyPermission: false })).toBe(
      false,
    );
    expect(canConfigurePolicies({ ...base, policyPermission: true })).toBe(
      true,
    );
  });
});

describe("policy definitions integrity", () => {
  it("every category has a matching config entry", () => {
    for (const cat of POLICY_CATEGORIES) {
      expect(POLICY_CONFIG[cat.id], `config for ${cat.id}`).toBeDefined();
      expect(POLICY_CONFIG[cat.id].fields.length).toBeGreaterThan(0);
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
