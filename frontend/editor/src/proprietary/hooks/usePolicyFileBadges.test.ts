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

describe("buildPolicyBadgeMap — failed runs mark the file as needing attention", () => {
  const failedOn = (map: Map<string, { failed?: boolean }[]>, id: string) =>
    (map.get(id) ?? []).some((b) => b.failed);

  it("marks the input file when its latest run FAILED (no output exists)", () => {
    const map = buildPolicyBadgeMap(
      [run({ status: "FAILED", outputFileIds: [] })],
      [{ id: "in" }],
      labels,
      NOW,
    );
    expect(failedOn(map, "in")).toBe(true);
  });

  it("a later successful retry of the same (policy, file) clears the warning", () => {
    const map = buildPolicyBadgeMap(
      [
        run({
          runId: "fail",
          status: "FAILED",
          outputFileIds: [],
          startedAt: NOW - 2_000,
        }),
        run({ runId: "retry", status: "COMPLETED", startedAt: NOW - 1_000 }),
      ],
      [{ id: "in" }, { id: "out" }],
      labels,
      NOW,
    );
    expect(failedOn(map, "in")).toBe(false);
    expect(failedOn(map, "out")).toBe(false);
  });

  it("a derived file inherits the warning via lineage", () => {
    const map = buildPolicyBadgeMap(
      [run({ status: "FAILED", outputFileIds: [] })],
      [{ id: "in" }, { id: "edit", parentFileId: "in" }],
      labels,
      NOW,
    );
    expect(failedOn(map, "edit")).toBe(true);
  });

  const ignoredOn = (map: Map<string, { ignored?: boolean }[]>, id: string) =>
    (map.get(id) ?? []).some((b) => b.ignored);

  it("an acknowledged failure drops the warning for an 'ignored' marker", () => {
    const map = buildPolicyBadgeMap(
      [run({ status: "FAILED", outputFileIds: [], acknowledged: true })],
      [{ id: "in" }],
      labels,
      NOW,
    );
    expect(failedOn(map, "in")).toBe(false);
    // Reviewed & ignored: the badge switches to the ignored marker (the render
    // layer keeps the policy accent rather than the amber warning colour).
    const badge = (map.get("in") ?? []).find((b) => b.id === "security");
    expect(badge?.ignored).toBe(true);
    expect(ignoredOn(map, "in")).toBe(true);
  });

  it("an acknowledged failure shows the ignored marker, never a 'ran' shield", () => {
    // Produced this file earlier (green shield), then a later run failed and
    // was approved: approving a failure must not read as a successful run.
    const map = buildPolicyBadgeMap(
      [
        run({
          runId: "ok",
          fileId: "src",
          outputFileIds: ["f"],
          startedAt: NOW - 2_000,
        }),
        run({
          runId: "bad",
          fileId: "f",
          status: "FAILED",
          outputFileIds: [],
          acknowledged: true,
          startedAt: NOW - 1_000,
        }),
      ],
      [{ id: "f" }],
      labels,
      NOW,
    );
    const badges = map.get("f") ?? [];
    expect(badges).toHaveLength(1);
    expect(badges[0].ignored).toBe(true);
    expect(badges[0].failed ?? false).toBe(false);
  });

  it("a later SUCCESS after an acknowledged failure still shows the green shield", () => {
    // Latest outcome is success (e.g. a retry that worked), so the honest "ran"
    // badge returns — suppression only applies while failure is the last word.
    const map = buildPolicyBadgeMap(
      [
        run({
          runId: "bad",
          fileId: "f",
          status: "FAILED",
          outputFileIds: [],
          acknowledged: true,
          startedAt: NOW - 2_000,
        }),
        run({
          runId: "ok",
          fileId: "f",
          outputFileIds: ["f"],
          startedAt: NOW - 1_000,
        }),
      ],
      [{ id: "f" }],
      labels,
      NOW,
    );
    expect((map.get("f") ?? []).map((b) => b.id)).toEqual(["security"]);
    expect(failedOn(map, "f")).toBe(false);
  });

  it("a retrying failed run shows the spinner, not the warning", () => {
    const map = buildPolicyBadgeMap(
      [run({ status: "FAILED", retrying: true, outputFileIds: [] })],
      [{ id: "in" }],
      labels,
      NOW,
    );
    expect(failedOn(map, "in")).toBe(false);
    expect((map.get("in") ?? []).some((b) => b.enforcing)).toBe(true);
  });

  it("sorts failed badges ahead of healthy ones so truncation can't hide them", () => {
    const map = buildPolicyBadgeMap(
      [
        run({ runId: "ok", categoryId: "watermark", outputFileIds: ["f"] }),
        run({
          runId: "bad",
          categoryId: "security",
          status: "FAILED",
          fileId: "f",
          outputFileIds: [],
        }),
      ],
      [{ id: "f" }],
      labels,
      NOW,
    );
    const refs = map.get("f") ?? [];
    expect(refs[0].id).toBe("security");
    expect(refs[0].failed).toBe(true);
  });
});
