import { describe, expect, it } from "vitest";
import {
  parseSuperSearchQuery,
  rebuildSuperSearchQuery,
} from "@app/components/shared/superSearch/superSearchFilters";
import type { SuperSearchScope } from "@app/hooks/useSuperSearch";

const SCOPES: SuperSearchScope[] = [
  { id: "portal-policies", label: "Policies", aliases: ["policy", "policies"] },
  { id: "tools", label: "Tools", aliases: ["tool", "tools"] },
];

describe("parseSuperSearchQuery", () => {
  it("returns the trimmed query untouched when no scopes exist", () => {
    const parsed = parseSuperSearchQuery("  policy: invoice ", []);
    expect(parsed).toEqual({
      query: "policy: invoice",
      prefixTokens: [],
      prefixedScopeIds: [],
    });
  });

  it("maps a known prefix to its scope and strips it from the query", () => {
    const parsed = parseSuperSearchQuery("policy: invoice", SCOPES);
    expect(parsed.query).toBe("invoice");
    expect(parsed.prefixedScopeIds).toEqual(["portal-policies"]);
    expect(parsed.prefixTokens).toEqual([
      { scopeId: "portal-policies", token: "policy:" },
    ]);
  });

  it("accepts chained prefixes and aliases case-insensitively", () => {
    const parsed = parseSuperSearchQuery("Policy:TOOLS: merge", SCOPES);
    expect(parsed.query).toBe("merge");
    expect(parsed.prefixedScopeIds).toEqual(["portal-policies", "tools"]);
  });

  it("dedupes repeated prefixes for the same scope", () => {
    const parsed = parseSuperSearchQuery("policy: policies: invoice", SCOPES);
    expect(parsed.prefixedScopeIds).toEqual(["portal-policies"]);
    expect(parsed.prefixTokens).toHaveLength(2);
  });

  it("stops at the first unknown token so colon text stays in the query", () => {
    const parsed = parseSuperSearchQuery("chapter: 1 policy: x", SCOPES);
    expect(parsed.query).toBe("chapter: 1 policy: x");
    expect(parsed.prefixedScopeIds).toEqual([]);
  });

  it("leaves colons after the first word alone", () => {
    const parsed = parseSuperSearchQuery("policy: name: value", SCOPES);
    expect(parsed.query).toBe("name: value");
    expect(parsed.prefixedScopeIds).toEqual(["portal-policies"]);
  });
});

describe("rebuildSuperSearchQuery", () => {
  it("keeps only the requested scopes' tokens, in original order", () => {
    const parsed = parseSuperSearchQuery("policy: tools: merge", SCOPES);
    expect(rebuildSuperSearchQuery(parsed, new Set(["tools"]))).toBe(
      "tools: merge",
    );
    expect(rebuildSuperSearchQuery(parsed, new Set())).toBe("merge");
    expect(
      rebuildSuperSearchQuery(parsed, new Set(["portal-policies", "tools"])),
    ).toBe("policy: tools: merge");
  });

  it("drops the trailing space when the free text is empty", () => {
    const parsed = parseSuperSearchQuery("policy:", SCOPES);
    expect(rebuildSuperSearchQuery(parsed, new Set())).toBe("");
  });
});
