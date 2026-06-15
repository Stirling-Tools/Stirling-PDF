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
const MAX_POLLS = 75;
const view = (status: string) =>
  ({ runId: "r1", status, outputs: [], error: null }) as never;

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
    // It gave up early — far short of the full poll cap.
    expect(getRun.mock.calls.length).toBeLessThan(MAX_POLLS);
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

  it("marks FAILED when the run never reaches a terminal state within the cap", async () => {
    getRun.mockResolvedValue(view("RUNNING"));
    const p = poll("r1");
    await tick(MAX_POLLS);
    await p;
    expect(update).toHaveBeenLastCalledWith(
      "r1",
      expect.objectContaining({ status: "FAILED" }),
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
