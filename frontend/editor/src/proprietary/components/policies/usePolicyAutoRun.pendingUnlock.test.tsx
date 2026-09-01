/**
 * An encrypted upload opens the unlock prompt and dispatches its policy in the same tick, so the
 * two race. If the user wins, the run fails on a document they have already replaced, billing for
 * it and leaving a row about a version that no longer exists. The dispatch waits for the answer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@app/hooks/useAiEngineEnabled", () => ({
  useAiEngineEnabled: () => false,
}));
const fileStubs: { id: string; name: string; derivedFromTool?: boolean }[] = [];
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ fileStubs }),
  useFileManagement: () => ({ addFiles: vi.fn() }),
  useFileContext: () => ({ consumeFiles: vi.fn() }),
}));
vi.mock("@app/hooks/usePolicies", () => ({
  usePolicies: () => ({
    policies: {
      security: {
        configured: true,
        status: "active",
        backendId: "backend-sec",
        runOn: "upload",
        runsOnEditor: true,
        order: 0,
      },
    },
  }),
}));
vi.mock("@app/services/policyApi", () => ({
  runStoredPolicy: vi.fn(),
  getPolicyRun: vi.fn(),
  downloadPolicyOutput: vi.fn(),
  resolvePolicyRunTarget: () => "saas",
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { getStirlingFile: vi.fn(), getStirlingFileStub: vi.fn() },
}));
vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({ bumpRevision: vi.fn() }),
}));

import { usePolicyAutoRun } from "@app/components/policies/usePolicyAutoRun";
import { resetPolicyRuns } from "@app/components/policies/policyRunStore";
import { setPendingUnlocks } from "@app/services/pendingUnlocks";
import { runStoredPolicy } from "@app/services/policyApi";
import { fileStorage } from "@app/services/fileStorage";

const runStored = vi.mocked(runStoredPolicy);
const getFile = vi.mocked(fileStorage.getStirlingFile);

function setFileStubs(next: typeof fileStubs) {
  fileStubs.length = 0;
  fileStubs.push(...next);
}

beforeEach(() => {
  vi.useFakeTimers();
  resetPolicyRuns();
  setPendingUnlocks([]);
  runStored.mockReset().mockResolvedValue("run-sec");
  getFile.mockReset().mockResolvedValue({ size: 1460 } as never);
  setFileStubs([]);
});
// Cleared in beforeEach, not here: notifying a component RTL has not unmounted yet
// would be a state update outside act.
afterEach(() => vi.useRealTimers());

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}

describe("an upload waiting on its unlock prompt", () => {
  it("holds the run back while the prompt is open", async () => {
    setPendingUnlocks(["file-locked"]);
    setFileStubs([{ id: "file-locked", name: "locked.pdf" }]);

    renderHook(() => usePolicyAutoRun());
    await settle();

    expect(runStored).not.toHaveBeenCalled();
  });

  it("runs once the prompt is answered, so skipping still records the failure", async () => {
    // Skipping releases the file encrypted: the run fails, and that failure is the row the
    // bell offers Decrypt and retry on. Holding it back forever would lose that entirely.
    setPendingUnlocks(["file-locked"]);
    setFileStubs([{ id: "file-locked", name: "locked.pdf" }]);

    renderHook(() => usePolicyAutoRun());
    await settle();
    expect(runStored).not.toHaveBeenCalled();

    act(() => setPendingUnlocks([]));
    await settle();

    expect(runStored).toHaveBeenCalledWith(
      "backend-sec",
      expect.anything(),
      "file-locked",
    );
  });

  it("leaves an upload nobody is prompting about alone", async () => {
    setFileStubs([{ id: "file-plain", name: "plain.pdf" }]);

    renderHook(() => usePolicyAutoRun());
    await settle();

    expect(runStored).toHaveBeenCalledTimes(1);
  });
});
