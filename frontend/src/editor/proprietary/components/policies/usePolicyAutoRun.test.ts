import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the network + the run store so we can drive the poll loop deterministically.
vi.mock("@app/services/policyApi", async (orig) => ({
  ...(await orig<typeof import("@app/services/policyApi")>()),
  getPolicyRun: vi.fn(),
}));
vi.mock("@app/components/policies/policyRunStore", async (orig) => ({
  ...(await orig<typeof import("@app/components/policies/policyRunStore")>()),
  updateRun: vi.fn(),
}));

import { poll } from "@app/components/policies/usePolicyAutoRun";
import { getPolicyRun } from "@app/services/policyApi";
import { updateRun } from "@app/components/policies/policyRunStore";

const getRun = vi.mocked(getPolicyRun);
const update = vi.mocked(updateRun);

const POLL_MS = 2000;
// Must match the poll loop's budget formula (stepCount × per-step timeout + grace).
// With the 2-step `view()` below that's 2 × 300_000 + 30_000 = 630_000ms.
const STEP_TIMEOUT_MS = 300_000;
const POLL_GRACE_MS = 30_000;
const STEP_COUNT = 2;
const BUDGET_MS = STEP_COUNT * STEP_TIMEOUT_MS + POLL_GRACE_MS;
const view = (status: string) =>
  ({
    runId: "r1",
    status,
    currentStep: 1,
    stepCount: STEP_COUNT,
    outputs: [],
    error: null,
  }) as never;

beforeEach(() => {
  vi.useFakeTimers();
  getRun.mockReset();
  update.mockReset();
});
afterEach(() => vi.useRealTimers());

/** Run the poll loop for n cadence ticks, flushing the awaited fetch each tick. */
async function tick(n: number) {
  for (let i = 0; i < n; i++) await vi.advanceTimersByTimeAsync(POLL_MS);
}

describe("policy run poll loop", () => {
  it("stops and marks FAILED after repeated run-not-found (404)", async () => {
    getRun.mockRejectedValue({ code: "ERR_NOT_FOUND" });
    const p = poll("r1");
    await tick(3); // MAX_NOT_FOUND consecutive 404s
    await p;
    expect(update).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ status: "FAILED" }),
    );
    // It gave up after the not-found streak, not after the full time budget.
    expect(getRun.mock.calls.length).toBe(3);
  });

  it("also detects 404 via axios-style response.status", async () => {
    getRun.mockRejectedValue({ response: { status: 404 } });
    const p = poll("r1");
    await tick(3);
    await p;
    expect(update).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ status: "FAILED" }),
    );
  });

  it("does NOT fail on a brief not-found blip that then recovers", async () => {
    getRun
      .mockRejectedValueOnce({ code: "ERR_NOT_FOUND" })
      .mockResolvedValue(view("COMPLETED"));
    const p = poll("r1");
    await tick(2);
    await p;
    const statuses = update.mock.calls.map(
      (c) => (c[1] as { status: string }).status,
    );
    expect(statuses).toContain("COMPLETED");
    expect(statuses).not.toContain("FAILED");
  });

  it("transient non-404 errors don't count toward the not-found streak", async () => {
    getRun
      .mockRejectedValueOnce({ code: "ERR_NOT_FOUND" })
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockRejectedValueOnce({ code: "ERR_NOT_FOUND" })
      .mockResolvedValue(view("COMPLETED"));
    const p = poll("r1");
    await tick(4);
    await p;
    const statuses = update.mock.calls.map(
      (c) => (c[1] as { status: string }).status,
    );
    expect(statuses).toContain("COMPLETED");
    expect(statuses).not.toContain("FAILED");
  });

  it("marks FAILED when the run never reaches a terminal state within the budget", async () => {
    getRun.mockResolvedValue(view("RUNNING"));
    const p = poll("r1");
    // Advance past the full step-count-derived budget in one go.
    await vi.advanceTimersByTimeAsync(BUDGET_MS + POLL_MS);
    await p;
    expect(update).toHaveBeenLastCalledWith(
      "r1",
      expect.objectContaining({ status: "FAILED" }),
    );
  });

  it("keeps polling a long run for the whole step budget (no premature giveup)", async () => {
    getRun.mockResolvedValue(view("RUNNING"));
    const p = poll("r1");
    // 200s in: a single step may run up to the per-step timeout, so the run is
    // still legitimately in flight and must keep being polled, not failed.
    await tick(100);
    expect(update).not.toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ status: "FAILED" }),
    );
    // Let it run out so the dangling promise doesn't leak into other tests.
    await vi.advanceTimersByTimeAsync(BUDGET_MS);
    await p;
  });

  it("records pipeline progress (currentStep/stepCount) while running", async () => {
    getRun
      .mockResolvedValueOnce(view("RUNNING"))
      .mockResolvedValue(view("COMPLETED"));
    const p = poll("r1");
    await tick(2);
    await p;
    expect(update).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ currentStep: 1, stepCount: STEP_COUNT }),
    );
  });

  it("finishes cleanly on a terminal status and fires onTerminal", async () => {
    getRun.mockResolvedValue(view("COMPLETED"));
    const onTerminal = vi.fn();
    const p = poll("r1", onTerminal);
    await tick(1);
    await p;
    expect(update).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ status: "COMPLETED" }),
    );
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ status: "FAILED" }),
    );
  });
});
