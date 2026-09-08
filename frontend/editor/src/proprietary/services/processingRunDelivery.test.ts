import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchRuns = vi.fn();
const fetchOutput = vi.fn();
vi.mock("@app/services/processingFolderApi", () => ({
  fetchProcessingFolderRuns: (policyId: string) => fetchRuns(policyId),
  fetchRunOutputFile: (output: unknown) => fetchOutput(output),
}));

import { deliverSweepResults } from "@app/services/processingRunDelivery";

/** A settled run with one output, in the shape the runs feed returns. */
const completedRun = (runId: string) => ({
  runId,
  status: "COMPLETED",
  fileName: `${runId}.pdf`,
  outputs: [{ fileId: `${runId}-out`, fileName: `${runId}.pdf` }],
});

// The loop only checks the fetched File is non-null, so a light stub avoids a
// File/Blob dependency on the test environment.
const fileFor = (name: string) => ({ name }) as unknown as File;

describe("deliverSweepResults - one live delivery per folder", () => {
  beforeEach(() => {
    fetchRuns.mockReset();
    fetchOutput.mockReset();
    fetchRuns.mockResolvedValue([completedRun("r1")]);
    fetchOutput.mockResolvedValue(fileFor("r1.pdf"));
  });

  it("joins a delivery already running for the same folder rather than starting a second", async () => {
    const addFiles = vi.fn().mockResolvedValue(undefined);

    const first = deliverSweepResults("policy-1", 1, addFiles);
    const second = deliverSweepResults("policy-1", 1, addFiles);

    // Both callers ride one loop, so the run's outputs open once, not once per caller.
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(addFiles).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh delivery once the previous one for that folder has finished", async () => {
    const addFiles = vi.fn().mockResolvedValue(undefined);

    await deliverSweepResults("policy-1", 1, addFiles);
    // Registry cleared on completion: this is a new loop, not the resolved promise.
    await deliverSweepResults("policy-1", 1, addFiles);

    expect(addFiles).toHaveBeenCalledTimes(2);
  });

  it("does not join a callback-bearing caller, so its callbacks still fire", async () => {
    const addFiles = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();

    // A caller that needs progress (the wizard) must run its own loop rather than
    // join the callback-less one already running, which cannot fire its callbacks.
    const bare = deliverSweepResults("policy-1", 1, addFiles);
    const withCallbacks = deliverSweepResults("policy-1", 1, addFiles, {
      onProgress,
    });

    expect(withCallbacks).not.toBe(bare);
    await Promise.all([bare, withCallbacks]);
    expect(onProgress).toHaveBeenCalled();
  });

  it("delivers distinct folders in parallel - the guard is keyed per folder", async () => {
    fetchRuns.mockImplementation((policyId: string) =>
      Promise.resolve([completedRun(policyId)]),
    );
    fetchOutput.mockImplementation((output: { fileName: string }) =>
      Promise.resolve(fileFor(output.fileName)),
    );
    const addFiles = vi.fn().mockResolvedValue(undefined);

    const a = deliverSweepResults("policy-a", 1, addFiles);
    const b = deliverSweepResults("policy-b", 1, addFiles);

    expect(b).not.toBe(a);
    await Promise.all([a, b]);
    expect(addFiles).toHaveBeenCalledTimes(2);
  });
});
