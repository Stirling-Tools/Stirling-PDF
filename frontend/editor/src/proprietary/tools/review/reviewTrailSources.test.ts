import { describe, it, expect } from "vitest";
import {
  buildPolicyTrailRuns,
  failedRunIdsForFile,
  orderFileIdsNeedingReview,
} from "@app/tools/review/reviewTrailSources";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

const labels = new Map([
  ["security", "Security"],
  ["classification", "Classification"],
]);
const STEP_LABEL = "Enforcement run";

function run(overrides: Partial<PolicyRunRecord>): PolicyRunRecord {
  return {
    runId: "r1",
    categoryId: "security",
    fileId: "in",
    fileName: "in.pdf",
    fileSize: 1,
    target: "saas",
    status: "COMPLETED",
    outputs: [],
    outputFileIds: ["out"],
    error: null,
    startedAt: 1_000,
    ...overrides,
  };
}

describe("buildPolicyTrailRuns — policy runs land in the review trail", () => {
  it("maps a failed run on the reviewed file, carrying error code + message", () => {
    const trail = buildPolicyTrailRuns(
      [
        run({
          status: "FAILED",
          outputFileIds: [],
          errorCode: "POLICY_STEP_FAILED",
          error: "Watermark step timed out.",
        }),
      ],
      { id: "in" },
      labels,
      STEP_LABEL,
    );
    expect(trail).toHaveLength(1);
    expect(trail[0].source).toBe("policy");
    expect(trail[0].name).toBe("Security");
    expect(trail[0].steps[0].status).toBe("failed");
    expect(trail[0].steps[0].detail).toBe(
      "POLICY_STEP_FAILED — Watermark step timed out.",
    );
  });

  it("matches the run when reviewing its OUTPUT file, and via lineage", () => {
    const completed = run({});
    // Reviewing the output directly.
    expect(
      buildPolicyTrailRuns([completed], { id: "out" }, labels, STEP_LABEL),
    ).toHaveLength(1);
    // Reviewing a later edit derived from the output.
    expect(
      buildPolicyTrailRuns(
        [completed],
        { id: "edit", sourceFileIds: ["out"] },
        labels,
        STEP_LABEL,
      ),
    ).toHaveLength(1);
    // An unrelated file sees nothing.
    expect(
      buildPolicyTrailRuns([completed], { id: "other" }, labels, STEP_LABEL),
    ).toHaveLength(0);
  });

  it("skips in-flight runs, keeps terminal ones sorted oldest-first", () => {
    const trail = buildPolicyTrailRuns(
      [
        run({ runId: "b", startedAt: 2_000, status: "COMPLETED" }),
        run({ runId: "pending", status: "PENDING" }),
        run({
          runId: "a",
          startedAt: 1_000,
          status: "FAILED",
          outputFileIds: [],
          categoryId: "classification",
        }),
      ],
      { id: "in" },
      labels,
      STEP_LABEL,
    );
    expect(trail.map((r) => r.id)).toEqual(["a", "b"]);
    expect(trail[0].name).toBe("Classification");
  });
});

describe("failedRunIdsForFile — which runs an approval signs off on", () => {
  it("returns failed, unacknowledged runs for the file (input, output, or lineage)", () => {
    const runs = [
      run({
        runId: "fail-in",
        status: "FAILED",
        fileId: "in",
        outputFileIds: [],
      }),
      run({ runId: "ok", status: "COMPLETED", fileId: "in" }),
      run({
        runId: "fail-out",
        status: "FAILED",
        fileId: "other",
        outputFileIds: ["out"],
      }),
    ];
    // Reviewing the input file: catches its own failure + the run that output it.
    expect(
      failedRunIdsForFile(runs, { id: "in", sourceFileIds: ["out"] }),
    ).toEqual(["fail-in", "fail-out"]);
  });

  it("excludes already-acknowledged and retrying runs, and unrelated files", () => {
    const runs = [
      run({
        runId: "acked",
        status: "FAILED",
        outputFileIds: [],
        acknowledged: true,
      }),
      run({
        runId: "retrying",
        status: "FAILED",
        outputFileIds: [],
        retrying: true,
      }),
      run({
        runId: "elsewhere",
        status: "FAILED",
        fileId: "z",
        outputFileIds: [],
      }),
    ];
    expect(failedRunIdsForFile(runs, { id: "in" })).toEqual([]);
  });
});

describe("orderFileIdsNeedingReview — flagged longest-ago first", () => {
  it("orders flagged files by their earliest outstanding failure, oldest first", () => {
    const runs = [
      run({
        runId: "a",
        fileId: "A",
        status: "FAILED",
        outputFileIds: [],
        startedAt: 3_000,
      }),
      run({
        runId: "b",
        fileId: "B",
        status: "FAILED",
        outputFileIds: [],
        startedAt: 1_000,
      }),
      run({
        runId: "c",
        fileId: "C",
        status: "FAILED",
        outputFileIds: [],
        startedAt: 2_000,
      }),
    ];
    expect(orderFileIdsNeedingReview(runs)).toEqual(["B", "C", "A"]);
  });

  it("omits files with no outstanding failure (clean, acknowledged, retrying)", () => {
    const runs = [
      run({
        runId: "flagged",
        fileId: "A",
        status: "FAILED",
        outputFileIds: [],
        startedAt: 1_000,
      }),
      run({
        runId: "ok",
        fileId: "B",
        status: "COMPLETED",
        outputFileIds: ["B"],
      }),
      run({
        runId: "acked",
        fileId: "C",
        status: "FAILED",
        outputFileIds: [],
        acknowledged: true,
      }),
      run({
        runId: "busy",
        fileId: "D",
        status: "FAILED",
        outputFileIds: [],
        retrying: true,
      }),
    ];
    expect(orderFileIdsNeedingReview(runs)).toEqual(["A"]);
  });

  it("drops a file whose later retry succeeded (latest terminal run wins)", () => {
    // Mirrors the badge map: an old failure that a newer run fixed must not
    // keep the file in the queue, or badges and queue would disagree.
    const runs = [
      run({
        runId: "bad",
        fileId: "A",
        status: "FAILED",
        outputFileIds: [],
        startedAt: 1_000,
      }),
      run({
        runId: "good",
        fileId: "A",
        status: "COMPLETED",
        outputFileIds: ["A"],
        startedAt: 2_000,
      }),
    ];
    expect(orderFileIdsNeedingReview(runs)).toEqual([]);
  });

  it("includes files that are not open in the workbench", () => {
    // The queue is derived from the run store, not the workspace, so a stored
    // file that was flagged and then closed is still reachable for review.
    const runs = [
      run({
        runId: "closed",
        fileId: "stored-only",
        status: "FAILED",
        outputFileIds: [],
        startedAt: 1_000,
      }),
    ];
    expect(orderFileIdsNeedingReview(runs)).toEqual(["stored-only"]);
  });
});
