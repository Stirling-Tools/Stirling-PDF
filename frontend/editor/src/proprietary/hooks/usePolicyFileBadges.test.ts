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

describe("buildPolicyBadgeMap — enforcing spinner while a run is in flight", () => {
  const enforcingOn = (
    map: Map<string, { enforcing?: boolean }[]>,
    id: string,
  ) => (map.get(id) ?? []).some((b) => b.enforcing);

  it("marks the input file enforcing while the run is RUNNING", () => {
    const map = buildPolicyBadgeMap(
      [run({ status: "RUNNING", outputFileIds: [] })],
      [{ id: "in" }],
      labels,
      NOW,
    );
    expect(enforcingOn(map, "in")).toBe(true);
  });

  it("keeps enforcing after COMPLETED until the outputs are imported", () => {
    // Status reaches COMPLETED before the async import lands — the spinner
    // must survive that gap, then clear once imported.
    const before = buildPolicyBadgeMap(
      [run({ status: "COMPLETED" })],
      [{ id: "in" }],
      labels,
      NOW,
    );
    expect(enforcingOn(before, "in")).toBe(true);

    const after = buildPolicyBadgeMap(
      [run({ status: "COMPLETED", imported: true })],
      [{ id: "in" }],
      labels,
      NOW,
    );
    expect(enforcingOn(after, "in")).toBe(false);
  });

  it("clears enforcing when the run settles as FAILED or CANCELLED", () => {
    for (const status of ["FAILED", "CANCELLED"] as const) {
      const map = buildPolicyBadgeMap(
        [run({ status, outputFileIds: [] })],
        [{ id: "in" }],
        labels,
        NOW,
      );
      expect(enforcingOn(map, "in")).toBe(false);
    }
  });

  it("keeps enforcing on a settled run that is auto-retrying", () => {
    const map = buildPolicyBadgeMap(
      [run({ status: "FAILED", retrying: true, outputFileIds: [] })],
      [{ id: "in" }],
      labels,
      NOW,
    );
    expect(enforcingOn(map, "in")).toBe(true);
  });

  it("skips runs with no input fileId (server-reconciled orphans)", () => {
    const map = buildPolicyBadgeMap(
      [run({ status: "RUNNING", fileId: "", outputFileIds: [] })],
      [{ id: "in" }],
      labels,
      NOW,
    );
    expect(enforcingOn(map, "in")).toBe(false);
  });
});
