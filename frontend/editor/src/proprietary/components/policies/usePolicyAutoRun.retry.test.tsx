import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// The auto-run hook reaches into several contexts + the network; stub those so we can drive just
// the queue-rejection retry path against the REAL run store.
vi.mock("@app/constants/featureFlags", () => ({ POLICIES_ENABLED: true }));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ fileStubs: [] }),
  useFileManagement: () => ({ addFiles: vi.fn() }),
  useFileContext: () => ({ consumeFiles: vi.fn() }),
}));
vi.mock("@app/hooks/usePolicies", () => ({
  usePolicies: () => ({
    policies: {
      security: {
        configured: true,
        status: "active",
        backendId: "backend-1",
        runOn: "upload",
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
import {
  recordRunStart,
  getRun,
  resetPolicyRuns,
  usePolicyRuns,
} from "@app/components/policies/policyRunStore";
import { runStoredPolicy, getPolicyRun } from "@app/services/policyApi";
import { fileStorage } from "@app/services/fileStorage";

const getRunApi = vi.mocked(getPolicyRun);
const runStored = vi.mocked(runStoredPolicy);
const getFile = vi.mocked(fileStorage.getStirlingFile);

const queueFullView = {
  runId: "run-1",
  status: "FAILED",
  currentStep: 0,
  stepCount: 2,
  error: "Policy run could not be queued: Job queue full",
  errorCode: "POLICY_QUEUE_FULL",
  outputs: [],
} as never;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetPolicyRuns();
  getRunApi.mockReset();
  runStored.mockReset();
  getFile.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("auto-run queue-rejection retry", () => {
  it("relabels a queue-rejected run as retrying, then re-dispatches it in place", async () => {
    // The polled run comes back queue-rejected; the retry resolves the file + fires a fresh run.
    getRunApi.mockResolvedValue(queueFullView);
    getFile.mockResolvedValue({ size: 1234 } as never);
    runStored.mockResolvedValue("run-2");

    recordRunStart({
      runId: "run-1",
      categoryId: "security",
      fileId: "file-1",
      fileName: "doc.pdf",
      fileSize: 1234,
      target: "saas",
      status: "RUNNING",
      outputs: [],
      error: null,
      startedAt: 0,
    });

    renderHook(() => {
      usePolicyAutoRun();
      return usePolicyRuns();
    });

    // First poll (2s cadence) sees the rejection → relabel as a soft "retrying" row.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(getRun("run-1")?.retrying).toBe(true);
    expect(runStored).not.toHaveBeenCalled();

    // After the first backoff window (BASE 4s) the rejected record is dropped and a fresh run fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(runStored).toHaveBeenCalledWith("backend-1", [{ size: 1234 }]);
    expect(getRun("run-1")).toBeUndefined();
    expect(getRun("run-2")?.status).toBe("PENDING");
  });
});
