import { describe, it, expect, beforeEach } from "vitest";
import {
  dispatchKey,
  getRun,
  isDispatched,
  markDispatched,
  recordRunStart,
  removeRun,
  updateRun,
  resetPolicyRuns,
  type PolicyRunRecord,
} from "@app/components/policies/policyRunStore";

function rec(over: Partial<PolicyRunRecord>): PolicyRunRecord {
  return {
    runId: "r1",
    categoryId: "security",
    fileId: "f1",
    fileName: "f.pdf",
    fileSize: 10,
    status: "PENDING",
    outputs: [],
    error: null,
    startedAt: 1,
    ...over,
  };
}

// The store reads localStorage at import; reset state + storage per test.
function read(key: string) {
  return JSON.parse(localStorage.getItem(key) ?? "{}");
}

describe("policyRunStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetPolicyRuns();
  });

  it("records a run start and marks the (policy, file) pair dispatched", () => {
    expect(isDispatched("security", "f1")).toBe(false);
    recordRunStart(rec({}));
    expect(isDispatched("security", "f1")).toBe(true);
    const stored = read("stirling-policy-runs");
    expect(stored.runs).toHaveLength(1);
    expect(stored.dispatched).toContain(dispatchKey("security", "f1"));
  });

  it("markDispatched is idempotent and independent of a run record", () => {
    markDispatched("routing", "f9");
    markDispatched("routing", "f9");
    expect(isDispatched("routing", "f9")).toBe(true);
    expect(read("stirling-policy-runs").dispatched).toHaveLength(1);
  });

  it("updateRun patches an in-flight run's status + outputs", () => {
    recordRunStart(rec({ runId: "abc" }));
    updateRun("abc", {
      status: "COMPLETED",
      outputs: [{ fileId: "out-1", fileName: "redacted.pdf" }],
    });
    const run = read("stirling-policy-runs").runs[0];
    expect(run.status).toBe("COMPLETED");
    expect(run.outputs).toEqual([
      { fileId: "out-1", fileName: "redacted.pdf" },
    ]);
  });

  it("updateRun ignores an unknown run id", () => {
    recordRunStart(rec({ runId: "abc", status: "PENDING" }));
    updateRun("nope", { status: "FAILED" });
    expect(read("stirling-policy-runs").runs[0].status).toBe("PENDING");
  });

  it("getRun returns the record by id, removeRun drops it but keeps the dispatched key", () => {
    recordRunStart(rec({ runId: "abc" }));
    expect(getRun("abc")?.fileId).toBe("f1");
    removeRun("abc");
    expect(getRun("abc")).toBeUndefined();
    expect(read("stirling-policy-runs").runs).toHaveLength(0);
    // The (policy, file) pair stays dispatched so the auto-run doesn't re-fire on its own.
    expect(isDispatched("security", "f1")).toBe(true);
  });

  it("caps stored runs at 50, newest first", () => {
    for (let i = 0; i < 55; i++) {
      recordRunStart(rec({ runId: `r${i}`, fileId: `f${i}`, startedAt: i }));
    }
    const runs = read("stirling-policy-runs").runs;
    expect(runs).toHaveLength(50);
    expect(runs[0].runId).toBe("r54"); // most recent
  });
});
