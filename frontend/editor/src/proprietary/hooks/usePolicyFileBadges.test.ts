import { describe, it, expect } from "vitest";
import { buildPolicyBadgeMap } from "@app/hooks/usePolicyFileBadges";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

const labels = new Map([
  ["security", "Security"],
  ["watermark", "Watermark"],
  ["classification", "Classification"],
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
    startedAt: 0,
    ...overrides,
  };
}

describe("buildPolicyBadgeMap — badge follows the document onto derived files", () => {
  it("badges a policy's direct output", () => {
    const map = buildPolicyBadgeMap([run({})], [{ id: "out" }], labels);
    expect((map.get("out") ?? []).map((b) => b.id)).toEqual(["security"]);
  });

  it("a versioned edit inherits the badge via parentFileId", () => {
    const map = buildPolicyBadgeMap(
      [run({})],
      [{ id: "out" }, { id: "edit", parentFileId: "out" }],
      labels,
    );
    expect((map.get("edit") ?? []).map((b) => b.id)).toEqual(["security"]);
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
    );
    expect((map.get("part1") ?? []).map((b) => b.id)).toEqual(["security"]);
    expect((map.get("part2") ?? []).map((b) => b.id)).toEqual(["security"]);
  });

  it("resolves transitively when an intermediate edit was consumed/removed", () => {
    // redact → edit (consumed) → split. The split part's sourceFileIds carries
    // the original output id directly, so the badge still resolves.
    const map = buildPolicyBadgeMap(
      [run({})],
      [{ id: "part", sourceFileIds: ["editGone", "out"] }],
      labels,
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
    );
    expect(map.has("unrelated")).toBe(false);
  });

  it("a completed classification run badges the files it tagged", () => {
    // Classification is metadata-only: its outputFileIds are the tagged
    // workspace files (no forked version), so the label badge persists there.
    const map = buildPolicyBadgeMap(
      [
        run({
          categoryId: "classification",
          fileId: "in",
          outputFileIds: ["in"],
          imported: true,
        }),
      ],
      [{ id: "in" }],
      labels,
    );
    const badges = map.get("in") ?? [];
    expect(badges.map((b) => b.id)).toEqual(["classification"]);
    expect(badges[0].enforcing).toBeUndefined();
    expect(badges[0].background).toBeUndefined();
  });
});

describe("buildPolicyBadgeMap — in-flight indicators", () => {
  const enforcingOn = (
    map: Map<string, { enforcing?: boolean }[]>,
    id: string,
  ) => (map.get(id) ?? []).some((b) => b.enforcing);

  it("marks the input file enforcing while the run is RUNNING", () => {
    const map = buildPolicyBadgeMap(
      [run({ status: "RUNNING", outputFileIds: [] })],
      [{ id: "in" }],
      labels,
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
    );
    expect(enforcingOn(before, "in")).toBe(true);

    const after = buildPolicyBadgeMap(
      [run({ status: "COMPLETED", imported: true })],
      [{ id: "in" }],
      labels,
    );
    expect(enforcingOn(after, "in")).toBe(false);
  });

  it("clears enforcing when the run settles as FAILED or CANCELLED", () => {
    for (const status of ["FAILED", "CANCELLED"] as const) {
      const map = buildPolicyBadgeMap(
        [run({ status, outputFileIds: [] })],
        [{ id: "in" }],
        labels,
      );
      expect(enforcingOn(map, "in")).toBe(false);
    }
  });

  it("keeps enforcing on a settled run that is auto-retrying", () => {
    const map = buildPolicyBadgeMap(
      [run({ status: "FAILED", retrying: true, outputFileIds: [] })],
      [{ id: "in" }],
      labels,
    );
    expect(enforcingOn(map, "in")).toBe(true);
  });

  it("skips runs with no input fileId (server-reconciled orphans)", () => {
    const map = buildPolicyBadgeMap(
      [run({ status: "RUNNING", fileId: "", outputFileIds: [] })],
      [{ id: "in" }],
      labels,
    );
    expect(enforcingOn(map, "in")).toBe(false);
  });

  it("an in-flight classification run is background, never enforcing", () => {
    // Non-blocking: shows a spinner but must never trip the enforcing flag
    // that gates actions and overlays.
    const map = buildPolicyBadgeMap(
      [
        run({
          categoryId: "classification",
          status: "RUNNING",
          outputFileIds: [],
        }),
      ],
      [{ id: "in" }],
      labels,
    );
    const badges = map.get("in") ?? [];
    expect(badges.map((b) => b.id)).toEqual(["classification"]);
    expect(badges[0].background).toBe(true);
    expect(enforcingOn(map, "in")).toBe(false);
  });
});
