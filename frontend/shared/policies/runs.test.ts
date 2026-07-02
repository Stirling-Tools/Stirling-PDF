import { describe, it, expect } from "vitest";
import { runsToStats, runsToActivity } from "@shared/policies/runs";
import type { PolicyRunView } from "@shared/policies/types";

const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;
// Use the actual current time so relative-time formatting in runs.ts is correct.
const NOW = Date.now();

const completed = (
  id: string,
  ts: number,
  file = "doc.pdf",
): PolicyRunView => ({
  runId: id,
  policyId: "pol_1",
  status: "COMPLETED",
  currentStep: 2,
  stepCount: 2,
  error: null,
  outputs: [{ fileId: "f", fileName: file }],
  createdAt: ts,
});

const failed = (
  id: string,
  ts: number,
  err = "Redaction failed",
): PolicyRunView => ({
  runId: id,
  policyId: "pol_1",
  status: "FAILED",
  currentStep: 1,
  stepCount: 2,
  error: err,
  outputs: [],
  createdAt: ts,
});

const running = (id: string, ts: number, step = 1): PolicyRunView => ({
  runId: id,
  policyId: "pol_1",
  status: "RUNNING",
  currentStep: step,
  stepCount: 2,
  error: null,
  outputs: [],
  createdAt: ts,
});

describe("runsToStats", () => {
  it("counts only COMPLETED runs as enforced", () => {
    const runs: PolicyRunView[] = [
      completed("a", NOW - 10 * MIN),
      completed("b", NOW - 20 * MIN),
      failed("c", NOW - 30 * MIN),
      running("d", NOW - 5 * MIN),
    ];
    expect(runsToStats(runs).enforced).toBe(2);
  });

  it("returns — for dataProcessed (not available from wire)", () => {
    expect(runsToStats([completed("a", NOW - MIN)]).dataProcessed).toBe("—");
  });

  it("returns — for activeFor when there are no runs", () => {
    expect(runsToStats([]).activeFor).toBe("—");
  });

  it("computes activeFor from the oldest run", () => {
    const runs = [completed("a", NOW - 2 * DAY), completed("b", NOW - 5 * DAY)];
    expect(runsToStats(runs).activeFor).toBe("5d");
  });
});

describe("runsToActivity", () => {
  it("maps COMPLETED to enforced status", () => {
    const [row] = runsToActivity([
      completed("a", NOW - 10 * MIN, "invoice.pdf"),
    ]);
    expect(row.status).toBe("enforced");
    expect(row.doc).toBe("invoice.pdf");
  });

  it("maps FAILED to flagged status with the error message", () => {
    const [row] = runsToActivity([failed("b", NOW - HOUR, "Low confidence")]);
    expect(row.status).toBe("flagged");
    expect(row.action).toBe("Low confidence");
  });

  it("maps RUNNING to processing status", () => {
    const [row] = runsToActivity([running("c", NOW - MIN)]);
    expect(row.status).toBe("processing");
  });

  it("maps CANCELLED to flagged status", () => {
    const run: PolicyRunView = {
      ...failed("x", NOW - MIN, "Cancelled by user"),
      status: "CANCELLED",
    };
    expect(runsToActivity([run])[0].status).toBe("flagged");
  });

  it("maps PENDING to processing status", () => {
    const run: PolicyRunView = {
      ...running("x", NOW - MIN),
      status: "PENDING",
    };
    expect(runsToActivity([run])[0].status).toBe("processing");
  });

  it("maps WAITING_FOR_INPUT to processing status", () => {
    const run: PolicyRunView = {
      ...running("x", NOW - MIN),
      status: "WAITING_FOR_INPUT",
    };
    expect(runsToActivity([run])[0].status).toBe("processing");
  });

  it("falls back to 'Enforcement failed' when FAILED run has no error message", () => {
    const run: PolicyRunView = { ...failed("x", NOW - MIN), error: null };
    expect(runsToActivity([run])[0].action).toBe("Enforcement failed");
  });

  it("shows step progress when currentStep and stepCount are set", () => {
    const [row] = runsToActivity([running("c", NOW - MIN, 1)]);
    expect(row.action).toContain("step 1/2");
  });

  it("falls back to Policy run when outputs is empty", () => {
    const noOutput: PolicyRunView = { ...running("x", NOW - MIN), outputs: [] };
    expect(runsToActivity([noOutput])[0].doc).toBe("Policy run");
  });

  it("formats recent timestamps as Nm ago", () => {
    const [row] = runsToActivity([completed("a", NOW - 5 * MIN)]);
    expect(row.time).toBe("5m ago");
  });

  it("formats hour-range timestamps as Nh ago", () => {
    const [row] = runsToActivity([completed("a", NOW - 2 * HOUR)]);
    expect(row.time).toBe("2h ago");
  });

  it("formats day-range timestamps as Nd ago", () => {
    const [row] = runsToActivity([completed("a", NOW - 3 * DAY)]);
    expect(row.time).toBe("3d ago");
  });
});
