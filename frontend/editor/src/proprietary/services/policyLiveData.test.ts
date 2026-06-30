import { describe, it, expect } from "vitest";

import {
  runsToActivity,
  runsToStats,
  policyActiveFor,
} from "@app/services/policyLiveData";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

function run(over: Partial<PolicyRunRecord>): PolicyRunRecord {
  return {
    runId: "r1",
    categoryId: "security",
    fileId: "f1",
    fileName: "f.pdf",
    fileSize: 0,
    target: "saas",
    status: "COMPLETED",
    outputs: [],
    error: null,
    startedAt: Date.now(),
    ...over,
  };
}

const HOUR = 3_600_000;

describe("runsToActivity", () => {
  it("maps completed/running/failed runs to activity rows", () => {
    const activity = runsToActivity([
      run({ runId: "a", fileName: "fresh.pdf", status: "RUNNING" }),
      run({
        runId: "b",
        fileName: "contract.pdf",
        status: "COMPLETED",
        fileSize: 2_100_000,
        startedAt: Date.now() - HOUR,
      }),
      run({
        runId: "c",
        fileName: "bad.pdf",
        status: "FAILED",
        error: "Step 2 failed",
      }),
    ]);

    expect(activity).toHaveLength(3);
    expect(activity[0]).toMatchObject({
      doc: "fresh.pdf",
      status: "processing",
      action: "Enforcing...",
    });
    expect(activity[1]).toMatchObject({
      doc: "contract.pdf",
      status: "enforced",
    });
    expect(activity[1].action).toContain("2.0 MB");
    expect(activity[2]).toMatchObject({
      doc: "bad.pdf",
      status: "flagged",
      action: "Step 2 failed",
    });
  });

  it("shows pipeline progress on a running run once the step is known", () => {
    const [withStep, noStep] = runsToActivity([
      run({ runId: "a", status: "RUNNING", currentStep: 1, stepCount: 2 }),
      run({ runId: "b", status: "RUNNING" }),
    ]);
    expect(withStep.action).toBe("Enforcing... · step 1/2");
    // Before the first status report (no step yet) it stays the plain label.
    expect(noStep.action).toBe("Enforcing...");
  });

  it("shows a queue-rejected run awaiting retry as busy, not a failure", () => {
    const [item] = runsToActivity([
      run({
        status: "FAILED",
        error: "Policy run could not be queued: Job queue full",
        errorCode: "POLICY_QUEUE_FULL",
        retrying: true,
      }),
    ]);
    expect(item.status).toBe("processing");
    expect(item.action).toBe("Busy, retrying...");
  });

  it("shows a queue rejection that has exhausted its retries as a failure", () => {
    const [item] = runsToActivity([
      run({
        status: "FAILED",
        error: "Policy run could not be queued: Job queue full",
        errorCode: "POLICY_QUEUE_FULL",
        // no `retrying` flag — the auto-retry budget is spent.
      }),
    ]);
    expect(item.status).toBe("flagged");
    expect(item.action).toContain("Job queue full");
  });
});

describe("runsToStats", () => {
  it("counts + sizes only the completed runs", () => {
    const stats = runsToStats(
      [
        run({ runId: "a", status: "COMPLETED", fileSize: 2_100_000 }),
        run({ runId: "b", status: "COMPLETED", fileSize: 900_000 }),
        run({ runId: "c", status: "RUNNING", fileSize: 5_000_000 }),
      ],
      undefined,
    );
    expect(stats.enforced).toBe(2);
    expect(stats.dataProcessed).toBe("2.9 MB");
    expect(stats.activeFor).toBe("Today");
  });

  it("derives activeFor from the backing folder's creation time", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
    expect(runsToStats([], fiveDaysAgo).activeFor).toBe("5d");
  });
});

describe("policyActiveFor", () => {
  it("returns 'Today' for a just-activated policy", () => {
    expect(policyActiveFor(new Date().toISOString())).toBe("Today");
  });
  it("returns 'Today' when there's no backing folder", () => {
    expect(policyActiveFor(undefined)).toBe("Today");
  });
  it("reports whole-day duration since activation", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
    expect(policyActiveFor(fiveDaysAgo)).toBe("5d");
  });
});
