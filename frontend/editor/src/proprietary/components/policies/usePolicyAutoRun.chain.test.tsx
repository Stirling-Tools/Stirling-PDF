import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Two active upload policies, so the auto-run should CHAIN them: fire the first on
// the upload, then the second on the first's output. Stub the contexts + network so
// we can drive the dispatch against the REAL run store.
vi.mock("@app/constants/featureFlags", () => ({ POLICIES_ENABLED: true }));
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
        order: 0,
      },
      classification: {
        configured: true,
        status: "active",
        backendId: "backend-cls",
        runOn: "upload",
        order: 1,
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
  updateRun,
  resetPolicyRuns,
} from "@app/components/policies/policyRunStore";
import { runStoredPolicy } from "@app/services/policyApi";
import { fileStorage } from "@app/services/fileStorage";

const runStored = vi.mocked(runStoredPolicy);
const getFile = vi.mocked(fileStorage.getStirlingFile);

/** Reset the shared file list between tests without swapping the array identity. */
function setFileStubs(next: typeof fileStubs) {
  fileStubs.length = 0;
  fileStubs.push(...next);
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetPolicyRuns();
  setFileStubs([]);
  runStored.mockReset();
  getFile.mockReset();
  getFile.mockResolvedValue({ size: 100 } as never);
});
afterEach(() => vi.useRealTimers());

describe("auto-run ordered chaining", () => {
  it("dispatches only the FIRST ordered policy on upload, not the whole set", async () => {
    setFileStubs([{ id: "file-1", name: "doc.pdf" }]);
    runStored.mockResolvedValue("run-sec");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    // The first policy (order 0) runs on the upload; the second waits for the chain.
    expect(runStored).toHaveBeenCalledTimes(1);
    expect(runStored).toHaveBeenCalledWith("backend-sec", [{ size: 100 }]);
  });

  it("chains the next policy onto a completed run's output", async () => {
    // A first-policy run that has completed and imported its output as file-1-v2.
    recordRunStart({
      runId: "run-sec",
      categoryId: "security",
      fileId: "file-1",
      fileName: "doc.pdf",
      fileSize: 100,
      target: "saas",
      status: "PENDING",
      outputs: [],
      error: null,
      startedAt: 0,
    });
    updateRun("run-sec", {
      status: "COMPLETED",
      imported: true,
      outputFileIds: ["file-1-v2"],
    });
    runStored.mockResolvedValue("run-cls");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    // The next policy (order 1) fires on the first policy's output, not the original.
    expect(runStored).toHaveBeenCalledWith("backend-cls", [{ size: 100 }]);
  });
});
