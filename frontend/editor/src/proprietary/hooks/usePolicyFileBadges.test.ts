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
    target: "saas",
    status: "COMPLETED",
    outputs: [],
    outputFileIds: ["out"],
    error: null,
    startedAt: NOW - 1_000, // recent by default
    ...overrides,
  };
}

describe("buildPolicyBadgeMap — badge follows the document onto derived files", () => {
  it("badges a policy's direct output, and marks it recent within the window", () => {
    const map = buildPolicyBadgeMap([run({})], [{ id: "out" }], labels, NOW);
    const badges = map.get("out") ?? [];
    expect(badges.map((b) => b.id)).toEqual(["security"]);
    expect(badges[0].recent).toBe(true);
  });

  it("a versioned edit inherits the badge via parentFileId (never glows)", () => {
    const map = buildPolicyBadgeMap(
      [run({})],
      [{ id: "out" }, { id: "edit", parentFileId: "out" }],
      labels,
      NOW,
    );
    const edit = map.get("edit") ?? [];
    expect(edit.map((b) => b.id)).toEqual(["security"]);
    expect(edit[0].recent).toBe(false);
  });

  it("SPLIT parts inherit the badge via sourceFileIds, though they have no parent", () => {
    // Split consumes the policy output "out" → two fresh roots, no parentFileId,
    // each recording sourceFileIds=["out"]. "out" itself is gone from the
    // workbench (consumed) but still lives in the run store.
    const map = buildPolicyBadgeMap(
      [run({})],
      [
        { id: "part1", sourceFileIds: ["out"] },
        { id: "part2", sourceFileIds: ["out"] },
      ],
      labels,
      NOW,
    );
    expect((map.get("part1") ?? []).map((b) => b.id)).toEqual(["security"]);
    expect((map.get("part2") ?? []).map((b) => b.id)).toEqual(["security"]);
    expect((map.get("part1") ?? [])[0].recent).toBe(false);
  });

  it("resolves transitively when an intermediate edit was consumed/removed", () => {
    // redact → edit (consumed) → split. The split part's sourceFileIds carries
    // the original output id directly, so the badge still resolves.
    const map = buildPolicyBadgeMap(
      [run({})],
      [{ id: "part", sourceFileIds: ["editGone", "out"] }],
      labels,
      NOW,
    );
    expect((map.get("part") ?? []).map((b) => b.id)).toEqual(["security"]);
  });

  it("MERGE output inherits every input's badge", () => {
    const map = buildPolicyBadgeMap(
      [
        run({ runId: "r1", categoryId: "security", outputFileIds: ["a"] }),
        run({ runId: "r2", categoryId: "watermark", outputFileIds: ["b"] }),
      ],
      [{ id: "merged", sourceFileIds: ["a", "b"] }],
      labels,
      NOW,
    );
    expect((map.get("merged") ?? []).map((b) => b.id).sort()).toEqual([
      "security",
      "watermark",
    ]);
  });

  it("a file with no policy provenance gets no badge", () => {
    const map = buildPolicyBadgeMap(
      [run({})],
      [{ id: "out" }, { id: "unrelated", sourceFileIds: ["someUpload"] }],
      labels,
      NOW,
    );
    expect(map.has("unrelated")).toBe(false);
  });

  it("inherited badges never glow even when the source run is recent", () => {
    const map = buildPolicyBadgeMap(
      [run({ startedAt: NOW })], // maximally recent
      [{ id: "out" }, { id: "part", sourceFileIds: ["out"] }],
      labels,
      NOW,
    );
    expect((map.get("out") ?? [])[0].recent).toBe(true);
    expect((map.get("part") ?? [])[0].recent).toBe(false);
  });
});
