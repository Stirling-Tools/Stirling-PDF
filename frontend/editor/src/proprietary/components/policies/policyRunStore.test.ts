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
    target: "saas",
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

  it("never evicts in-flight runs, even past the soft cap", () => {
    // A large upload batch can exceed the cap while still processing. Dropping a
    // live run would orphan its polling/import and undercount progress, so every
    // in-flight run is kept regardless of the cap.
    for (let i = 0; i < 210; i++) {
      recordRunStart(
        rec({
          runId: `r${i}`,
          fileId: `f${i}`,
          status: "PENDING",
          startedAt: i,
        }),
      );
    }
    const runs = read("stirling-policy-runs").runs;
    expect(runs).toHaveLength(210);
    expect(runs[0].runId).toBe("r209"); // newest first
  });

  it("evicts the oldest TERMINAL runs first once over the cap", () => {
    for (let i = 0; i < 210; i++) {
      recordRunStart(
        rec({
          runId: `r${i}`,
          fileId: `f${i}`,
          status: "COMPLETED",
          startedAt: i,
        }),
      );
    }
    const runs = read("stirling-policy-runs").runs;
    expect(runs).toHaveLength(200); // trimmed to MAX_RUNS
    expect(runs[0].runId).toBe("r209"); // newest kept
    expect(runs.some((r: PolicyRunRecord) => r.runId === "r0")).toBe(false); // oldest dropped
  });

  describe("processing wave (scopes the panel's progress counts to this upload)", () => {
    it("begins a new wave when recording with nothing in flight", () => {
      recordRunStart(rec({ runId: "a", fileId: "fa", startedAt: 500 }));
      expect(read("stirling-policy-runs").waveStartedAt).toBe(500);
    });

    it("keeps the wave while earlier runs are still in flight", () => {
      recordRunStart(rec({ runId: "a", fileId: "fa", startedAt: 100 }));
      recordRunStart(rec({ runId: "b", fileId: "fb", startedAt: 200 }));
      // b joined a's wave (a still PENDING) — the boundary stays at a.
      expect(read("stirling-policy-runs").waveStartedAt).toBe(100);
    });

    it("starts a fresh wave once the prior batch has all finished", () => {
      recordRunStart(rec({ runId: "a", fileId: "fa", startedAt: 100 }));
      // Prior batch completes AND imports → no longer in flight.
      updateRun("a", { status: "COMPLETED", imported: true });
      // A new upload after the lull resets the wave to itself.
      recordRunStart(rec({ runId: "b", fileId: "fb", startedAt: 5000 }));
      expect(read("stirling-policy-runs").waveStartedAt).toBe(5000);
    });
  });
});
