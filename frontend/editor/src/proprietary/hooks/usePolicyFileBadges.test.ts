import { describe, it, expect } from "vitest";
import {
  buildPolicyBadgeMap,
  buildProcessingMap,
} from "@app/hooks/usePolicyFileBadges";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

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
    startedAt: 0,
    ...overrides,
  };
}

describe("buildPolicyBadgeMap — badge follows the document onto derived files", () => {
  it("badges a policy's direct output", () => {
    const map = buildPolicyBadgeMap([run({})], [{ id: "out" }], labels);
    const badges = map.get("out") ?? [];
    expect(badges.map((b) => b.id)).toEqual(["security"]);
  });

  it("a versioned edit inherits the badge via parentFileId", () => {
    const map = buildPolicyBadgeMap(
      [run({})],
      [{ id: "out" }, { id: "edit", parentFileId: "out" }],
      labels,
    );
    const edit = map.get("edit") ?? [];
    expect(edit.map((b) => b.id)).toEqual(["security"]);
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
});

describe("buildProcessingMap — spinner while a policy works on a file", () => {
  it("marks the input file of an in-flight run as processing", () => {
    const map = buildProcessingMap([run({ status: "RUNNING" })], labels);
    expect(map.get("in")?.id).toBe("security");
  });

  it("treats a completed-but-not-yet-imported run as still processing", () => {
    const map = buildProcessingMap(
      [run({ status: "COMPLETED", imported: false })],
      labels,
    );
    expect(map.get("in")?.id).toBe("security");
  });

  it("clears once the run has been imported", () => {
    const map = buildProcessingMap(
      [run({ status: "COMPLETED", imported: true })],
      labels,
    );
    expect(map.has("in")).toBe(false);
  });

  it("treats a retry-backoff run as processing", () => {
    const map = buildProcessingMap(
      [run({ status: "FAILED", retrying: true })],
      labels,
    );
    expect(map.get("in")?.id).toBe("security");
  });

  it("does not mark failed or cancelled runs as processing", () => {
    expect(
      buildProcessingMap([run({ status: "FAILED" })], labels).has("in"),
    ).toBe(false);
    expect(
      buildProcessingMap([run({ status: "CANCELLED" })], labels).has("in"),
    ).toBe(false);
  });

  it("keeps the newest in-flight run per file (store is newest-first)", () => {
    const map = buildProcessingMap(
      [
        run({ runId: "new", categoryId: "watermark", status: "RUNNING" }),
        run({ runId: "old", categoryId: "security", status: "RUNNING" }),
      ],
      labels,
    );
    expect(map.get("in")?.id).toBe("watermark");
  });
});
