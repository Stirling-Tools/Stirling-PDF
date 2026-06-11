import { describe, it, expect } from "vitest";
import { buildPolicyBadgeMap } from "@app/hooks/usePolicyFileBadges";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

const NOW = 1_000_000;
const labels = new Map([
  ["security", "Security"],
  ["watermark", "Watermark"],
]);

function run(overrides: Partial<PolicyRunRecord>): PolicyRunRecord {
  return {
    runId: "r",
    categoryId: "security",
    fileId: "in",
    fileName: "in.pdf",
    fileSize: 1,
    status: "COMPLETED",
    outputs: [],
    outputFileIds: ["out"],
    error: null,
    startedAt: NOW - 1_000, // recent by default
    ...overrides,
  };
}

describe("buildPolicyBadgeMap — badge follows the document down tool edits", () => {
  it("badges a policy's direct output, and marks it recent within the window", () => {
    const map = buildPolicyBadgeMap([run({})], [{ id: "out" }], labels, NOW);
    const badges = map.get("out") ?? [];
    expect(badges.map((b) => b.id)).toEqual(["security"]);
    expect(badges[0].recent).toBe(true);
  });

  it("a tool-created child inherits the parent's badge (but never glows)", () => {
    const map = buildPolicyBadgeMap(
      [run({})],
      [{ id: "out" }, { id: "child", parentFileId: "out" }],
      labels,
      NOW,
    );
    const child = map.get("child") ?? [];
    expect(child.map((b) => b.id)).toEqual(["security"]);
    expect(child[0].recent).toBe(false); // carried, not freshly applied
  });

  it("inheritance is transitive across a chain of edits", () => {
    const map = buildPolicyBadgeMap(
      [run({})],
      [
        { id: "out" },
        { id: "child", parentFileId: "out" },
        { id: "grandchild", parentFileId: "child" },
      ],
      labels,
      NOW,
    );
    expect((map.get("grandchild") ?? []).map((b) => b.id)).toEqual([
      "security",
    ]);
  });

  it("a file with no policy ancestor gets no badge", () => {
    const map = buildPolicyBadgeMap(
      [run({})],
      [{ id: "out" }, { id: "unrelated" }],
      labels,
      NOW,
    );
    expect(map.has("unrelated")).toBe(false);
  });

  it("inherited badges never glow even when the ancestor run is recent", () => {
    const map = buildPolicyBadgeMap(
      [run({ startedAt: NOW })], // maximally recent
      [{ id: "out" }, { id: "child", parentFileId: "out" }],
      labels,
      NOW,
    );
    expect((map.get("out") ?? [])[0].recent).toBe(true);
    expect((map.get("child") ?? [])[0].recent).toBe(false);
  });

  it("merges distinct policies down the chain and dedupes a repeated one", () => {
    const map = buildPolicyBadgeMap(
      [
        run({ runId: "r1", categoryId: "security", outputFileIds: ["out"] }),
        run({
          runId: "r2",
          categoryId: "watermark",
          fileId: "child",
          outputFileIds: ["child"],
          startedAt: NOW - 2_000,
        }),
      ],
      [{ id: "out" }, { id: "child", parentFileId: "out" }],
      labels,
      NOW,
    );
    // child is watermark's direct output AND inherits security from its parent.
    const child = (map.get("child") ?? []).map((b) => b.id).sort();
    expect(child).toEqual(["security", "watermark"]);
  });
});
