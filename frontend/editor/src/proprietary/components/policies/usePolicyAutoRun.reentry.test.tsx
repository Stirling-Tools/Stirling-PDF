import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// A file can re-enter the workbench without being a new upload (My Files reopen, session restore).
// The persisted dispatch record must stop the upload policy (and its billing) firing a second time.

const mocks = vi.hoisted(() => ({
  workspace: [] as Array<{ id: string; derivedFromTool?: boolean }>,
  runStoredPolicy: vi.fn(),
  getPolicyRun: vi.fn(),
  listPolicyRuns: vi.fn(),
  getStirlingFile: vi.fn(),
}));

vi.mock("@app/hooks/useAiEngineEnabled", () => ({
  useAiEngineEnabled: () => true,
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ fileStubs: mocks.workspace }),
  useFileManagement: () => ({
    addFiles: vi.fn(),
    updateStirlingFileStub: vi.fn(),
  }),
  useFileContext: () => ({ consumeFiles: vi.fn() }),
}));
vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({ bumpRevision: vi.fn() }),
}));
vi.mock("@app/hooks/usePolicies", () => ({
  usePolicies: () => ({
    policies: {
      security: {
        configured: true,
        runsOnEditor: true,
        enabled: true,
        backendId: "backend-security",
        runOn: "upload",
        order: 0,
        outputMode: "new_version",
        outputName: "",
      },
    },
  }),
}));
vi.mock("@app/services/policyApi", () => ({
  runStoredPolicy: mocks.runStoredPolicy,
  getPolicyRun: mocks.getPolicyRun,
  listPolicyRuns: mocks.listPolicyRuns,
  downloadPolicyOutput: vi.fn(),
  resolvePolicyRunTarget: () => "saas",
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: mocks.getStirlingFile,
    getStirlingFileStub: vi.fn().mockResolvedValue(null),
    persistVersionedOutputs: vi.fn(),
    updateFileMetadata: vi.fn().mockResolvedValue(true),
  },
}));

import { usePolicyAutoRun } from "@app/components/policies/usePolicyAutoRun";
import {
  markDispatched,
  resetPolicyRuns,
} from "@app/components/policies/policyRunStore";

beforeEach(() => {
  localStorage.clear();
  resetPolicyRuns();
  vi.clearAllMocks();
  mocks.listPolicyRuns.mockResolvedValue([]);
  mocks.getStirlingFile.mockResolvedValue(
    new File(["x"], "doc.pdf", { type: "application/pdf" }),
  );
  mocks.runStoredPolicy.mockResolvedValue("run-0");
  // Completed with no outputs: the run settles without the import machinery.
  mocks.getPolicyRun.mockResolvedValue({
    runId: "run-0",
    policyId: null,
    status: "COMPLETED",
    currentStep: 1,
    stepCount: 1,
    error: null,
    outputs: [],
  });
});

describe("upload policies and files re-entering the workbench", () => {
  it("does not re-run on a file the policy already ran on", async () => {
    markDispatched("security", "already-enforced");
    mocks.workspace = [{ id: "already-enforced" }, { id: "fresh-upload" }];

    renderHook(() => usePolicyAutoRun());

    await waitFor(() => expect(mocks.runStoredPolicy).toHaveBeenCalledTimes(1));
    expect(mocks.getStirlingFile).toHaveBeenCalledWith("fresh-upload");
    expect(mocks.getStirlingFile).not.toHaveBeenCalledWith("already-enforced");
  });

  it("stays silent when every file in the workbench has already been enforced", async () => {
    markDispatched("security", "one");
    markDispatched("security", "two");
    mocks.workspace = [{ id: "one" }, { id: "two" }];

    renderHook(() => usePolicyAutoRun());

    // Give the dispatch effect a tick to (wrongly) fire before asserting silence.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.runStoredPolicy).not.toHaveBeenCalled();
  });

  it("still skips a policy's own output, which is not an upload at all", async () => {
    mocks.workspace = [{ id: "policy-output", derivedFromTool: true }];

    renderHook(() => usePolicyAutoRun());

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.runStoredPolicy).not.toHaveBeenCalled();
  });
});
