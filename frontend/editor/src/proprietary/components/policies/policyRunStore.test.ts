import { describe, it, expect, beforeEach } from "vitest";
import {
  appliedCategoriesFor,
  dispatchKey,
  getRun,
  isDispatched,
  localPassFailed,
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

  it("a browser-local run does not claim the (policy, file) dispatch key", () => {
    // The local classification heuristic records a run for the same (classification, file) pair
    // the server escalation is keyed on. If that claimed the key, the auto-run would read
    // "already dispatched" and never ask the AI - which killed escalation entirely.
    recordRunStart(
      rec({
        runId: "local-classification-f1-1",
        categoryId: "classification",
        fileId: "f1",
        target: "local",
        browserLocal: true,
        status: "RUNNING",
      }),
    );
    expect(getRun("local-classification-f1-1")).toBeDefined();
    expect(isDispatched("classification", "f1")).toBe(false);
  });

  it("a real backend run still claims the dispatch key", () => {
    recordRunStart(rec({ runId: "srv-1", categoryId: "classification" }));
    expect(isDispatched("classification", "f1")).toBe(true);
  });

  describe("localPassFailed", () => {
    it("reports a browser-local pass that could not produce a verdict", () => {
      recordRunStart(
        rec({
          runId: "local-c",
          categoryId: "classification",
          fileId: "f1",
          target: "local",
          browserLocal: true,
        }),
      );
      updateRun("local-c", { status: "FAILED", error: "encrypted" });

      expect(localPassFailed("classification", "f1")).toBe(true);
      expect(localPassFailed("classification", "f2")).toBe(false);
    });

    it("is false while the pass is still running, so the gate keeps waiting", () => {
      recordRunStart(
        rec({
          runId: "local-c",
          categoryId: "classification",
          fileId: "f1",
          target: "local",
          browserLocal: true,
          status: "RUNNING",
        }),
      );

      expect(localPassFailed("classification", "f1")).toBe(false);
    });

    it("ignores a failed SERVER run, which says nothing about the local pass", () => {
      recordRunStart(
        rec({ runId: "srv-1", categoryId: "classification", fileId: "f1" }),
      );
      updateRun("srv-1", { status: "FAILED", error: "boom" });

      expect(localPassFailed("classification", "f1")).toBe(false);
    });
  });

  describe("appliedCategoriesFor", () => {
    it("walks a rewriting chain back to the uploaded document", () => {
      recordRunStart(
        rec({ runId: "r-w", categoryId: "watermark", fileId: "f1" }),
      );
      updateRun("r-w", { status: "COMPLETED", outputFileIds: ["f2"] });
      recordRunStart(
        rec({ runId: "r-s", categoryId: "security", fileId: "f2" }),
      );
      updateRun("r-s", { status: "COMPLETED", outputFileIds: ["f3"] });

      expect([...appliedCategoriesFor("f3")].sort()).toEqual([
        "security",
        "watermark",
      ]);
    });

    it("counts an annotating run, which names its input as its own output", () => {
      recordRunStart(
        rec({ runId: "r-c", categoryId: "classification", fileId: "f1" }),
      );
      updateRun("r-c", { status: "COMPLETED", outputFileIds: ["f1"] });

      expect([...appliedCategoriesFor("f1")]).toEqual(["classification"]);
    });

    it("does not count a browser-local pass as the policy having run", () => {
      // The local heuristic settles COMPLETED with the input as its own output. Counting it
      // would make a retry skip classification, killing the escalation #7667 restored.
      recordRunStart(
        rec({
          runId: "local-c",
          categoryId: "classification",
          fileId: "f1",
          target: "local",
          browserLocal: true,
        }),
      );
      updateRun("local-c", { status: "COMPLETED", outputFileIds: ["f1"] });

      expect(appliedCategoriesFor("f1").size).toBe(0);
    });

    it("keeps climbing past an annotating run rather than stalling on it", () => {
      // The annotating run's output IS its input, so the walk must not treat that as a
      // lineage step - otherwise the cursor never moves and earlier policies are missed.
      recordRunStart(
        rec({ runId: "r-w", categoryId: "watermark", fileId: "f1" }),
      );
      updateRun("r-w", { status: "COMPLETED", outputFileIds: ["f2"] });
      recordRunStart(
        rec({ runId: "r-c", categoryId: "classification", fileId: "f2" }),
      );
      updateRun("r-c", { status: "COMPLETED", outputFileIds: ["f2"] });

      expect([...appliedCategoriesFor("f2")].sort()).toEqual([
        "classification",
        "watermark",
      ]);
    });

    it("ignores a run that failed, so it stays eligible to run again", () => {
      recordRunStart(
        rec({ runId: "r-f", categoryId: "security", fileId: "f1" }),
      );
      updateRun("r-f", { status: "FAILED", outputFileIds: ["f2"] });

      expect(appliedCategoriesFor("f2").size).toBe(0);
    });
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
    // Imported, since a COMPLETED-but-not-yet-imported run still counts as
    // in-flight (see isRunInFlight) and must never be evicted.
    for (let i = 0; i < 210; i++) {
      recordRunStart(
        rec({
          runId: `r${i}`,
          fileId: `f${i}`,
          status: "COMPLETED",
          imported: true,
          startedAt: i,
        }),
      );
    }
    const runs = read("stirling-policy-runs").runs;
    expect(runs).toHaveLength(200); // trimmed to MAX_RUNS
    expect(runs[0].runId).toBe("r209"); // newest kept
    expect(runs.some((r: PolicyRunRecord) => r.runId === "r0")).toBe(false); // oldest dropped
  });

  it("does not evict a COMPLETED run that hasn't been imported yet, even past the cap", () => {
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
    expect(runs).toHaveLength(210);
    expect(runs.some((r: PolicyRunRecord) => r.runId === "r0")).toBe(true);
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
