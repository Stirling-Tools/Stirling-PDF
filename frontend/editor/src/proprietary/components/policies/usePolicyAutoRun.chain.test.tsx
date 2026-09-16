import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { PolicyState } from "@app/types/policies";

// Two active file-producing upload policies, so the auto-run should CHAIN them: fire the first on
// the upload, then the second on the first's output. A classification policy is also present to
// assert the engine leaves it alone - annotating policies run themselves (see useClassificationPolicy),
// so they are never in this server chain. Stub the contexts + network to drive dispatch against the
// REAL run store.
const inputOperations = vi.hoisted<{
  security: PolicyState["firstOperation"];
  compliance: PolicyState["firstOperation"];
  archiveEnabled: boolean;
}>(() => ({
  security: "/api/v1/misc/compress-pdf",
  compliance: "/api/v1/misc/compress-pdf",
  archiveEnabled: false,
}));
const fileStubs: {
  id: string;
  name: string;
  derivedFromTool?: boolean;
  classificationLocked?: boolean;
}[] = [];
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
        runsOnEditor: true,
        enabled: true,
        backendId: "backend-sec",
        firstOperation: inputOperations.security,
        runOn: "upload",
        order: 0,
      },
      compliance: {
        configured: true,
        runsOnEditor: true,
        enabled: true,
        backendId: "backend-comp",
        firstOperation: inputOperations.compliance,
        runOn: "upload",
        order: 1,
      },
      classification: {
        configured: true,
        runsOnEditor: true,
        enabled: true,
        backendId: "backend-cls",
        runOn: "upload",
        order: 2,
      },
      archive: {
        configured: true,
        runsOnEditor: true,
        enabled: inputOperations.archiveEnabled,
        backendId: "backend-archive",
        firstOperation: "/api/v1/convert/img/pdf",
        runOn: "upload",
        order: 3,
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
  fileStorage: {
    getStirlingFile: vi.fn(),
    getStirlingFileStub: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({ bumpRevision: vi.fn() }),
}));

import { usePolicyAutoRun } from "@app/components/policies/usePolicyAutoRun";
import {
  recordRunStart,
  updateRun,
  getRun,
  resetPolicyRuns,
} from "@app/components/policies/policyRunStore";
import { runStoredPolicy, getPolicyRun } from "@app/services/policyApi";
import { fileStorage } from "@app/services/fileStorage";

const runStored = vi.mocked(runStoredPolicy);
const getRunStatus = vi.mocked(getPolicyRun);
const getFile = vi.mocked(fileStorage.getStirlingFile);

/** Reset the shared file list between tests without swapping the array identity. */
function setFileStubs(next: typeof fileStubs) {
  fileStubs.length = 0;
  fileStubs.push(...next);
}

function completeRun(
  runId: string,
  policyKey: string,
  fileId: string,
  outputFileIds: string[],
) {
  recordRunStart({
    runId,
    policyKey,
    fileId,
    fileName: "doc.pdf",
    fileSize: 100,
    target: "saas",
    status: "PENDING",
    outputs: [],
    error: null,
    startedAt: 0,
  });
  updateRun(runId, { status: "COMPLETED", imported: true, outputFileIds });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetPolicyRuns();
  setFileStubs([]);
  inputOperations.security = "/api/v1/misc/compress-pdf";
  inputOperations.compliance = "/api/v1/misc/compress-pdf";
  inputOperations.archiveEnabled = false;
  runStored.mockReset();
  getFile.mockReset();
  getFile.mockResolvedValue({ size: 100 } as never);
  vi.mocked(fileStorage.getStirlingFileStub).mockImplementation(
    async (id) =>
      ({
        id,
        name: "doc.pdf",
        type: "application/pdf",
      }) as never,
  );
});
afterEach(() => vi.useRealTimers());

describe("auto-run ordered chaining", () => {
  it("does not chain a compatible output whose classification is locked", async () => {
    completeRun("run-sec", "security", "original", ["locked", "unlocked"]);
    setFileStubs([
      {
        id: "locked",
        name: "locked.pdf",
        derivedFromTool: true,
        classificationLocked: true,
      },
      { id: "unlocked", name: "unlocked.pdf", derivedFromTool: true },
    ]);
    runStored.mockResolvedValue("run-comp");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored).toHaveBeenCalledTimes(1);
    expect(runStored).toHaveBeenCalledWith(
      "backend-comp",
      expect.anything(),
      "unlocked",
    );
    expect(getFile).not.toHaveBeenCalledWith("locked");
  });

  it("resumes a completed chain once the next policy's input metadata loads", async () => {
    inputOperations.compliance = undefined;
    completeRun("run-sec", "security", "original", ["pdf"]);
    setFileStubs([{ id: "pdf", name: "report.pdf", derivedFromTool: true }]);
    runStored.mockResolvedValue("run-comp");

    const { rerender } = renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(runStored).not.toHaveBeenCalled();

    inputOperations.compliance = "/api/v1/misc/compress-pdf";
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored).toHaveBeenCalledTimes(1);
    expect(runStored).toHaveBeenCalledWith(
      "backend-comp",
      expect.anything(),
      "pdf",
    );
  });

  it("skips an empty pipeline without holding up a compatible one", async () => {
    inputOperations.security = null;
    setFileStubs([{ id: "pdf", name: "report.pdf" }]);
    runStored.mockResolvedValue("run-comp");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored).toHaveBeenCalledTimes(1);
    expect(runStored).toHaveBeenCalledWith(
      "backend-comp",
      expect.anything(),
      "pdf",
    );
  });

  it("skips an incompatible middle policy and continues the output's chain", async () => {
    inputOperations.archiveEnabled = true;
    completeRun("run-sec", "security", "original", ["image"]);
    setFileStubs([{ id: "image", name: "page.png", derivedFromTool: true }]);
    runStored.mockResolvedValue("run-image");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored).toHaveBeenCalledTimes(1);
    expect(runStored).toHaveBeenCalledWith(
      "backend-archive",
      expect.anything(),
      "image",
    );
  });
  it("dispatches only matching files from a mixed upload", async () => {
    setFileStubs([
      { id: "pdf", name: "report.PDF" },
      { id: "image", name: "scan.png" },
      { id: "word", name: "letter.docx" },
    ]);
    runStored.mockResolvedValue("run-pdf");

    const { rerender } = renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored).toHaveBeenCalledTimes(1);
    expect(runStored).toHaveBeenCalledWith(
      "backend-sec",
      expect.anything(),
      "pdf",
    );
    expect(getFile).not.toHaveBeenCalledWith("image");
    expect(getFile).not.toHaveBeenCalledWith("word");
  });

  it("starts each file at its first compatible policy in team order", async () => {
    inputOperations.security = "/api/v1/convert/img/pdf";
    setFileStubs([
      { id: "image", name: "scan.PNG" },
      { id: "pdf", name: "report.pdf" },
      { id: "word", name: "letter.docx" },
    ]);
    runStored.mockImplementation(async (id) => `run-${id}`);

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored.mock.calls.map(([id, , fileId]) => [id, fileId])).toEqual([
      ["backend-sec", "image"],
      ["backend-comp", "pdf"],
    ]);
  });

  it("waits for a cached pipeline's first operation before dispatching", async () => {
    inputOperations.security = undefined;
    inputOperations.compliance = "/api/v1/convert/img/pdf";
    setFileStubs([{ id: "pdf", name: "report.pdf" }]);
    runStored.mockResolvedValue("run-pdf");

    const { rerender } = renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(runStored).not.toHaveBeenCalled();

    inputOperations.security = "/api/v1/misc/compress-pdf";
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(runStored).toHaveBeenCalledTimes(1);
  });

  it("checks each output's current type before chaining", async () => {
    completeRun("run-sec", "security", "original", ["image", "pdf"]);
    inputOperations.compliance = "/api/v1/convert/img/pdf";
    setFileStubs([
      { id: "image", name: "page.png", derivedFromTool: true },
      { id: "pdf", name: "report.pdf", derivedFromTool: true },
    ]);
    runStored.mockResolvedValue("run-image");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored).toHaveBeenCalledTimes(1);
    expect(runStored).toHaveBeenCalledWith(
      "backend-comp",
      expect.anything(),
      "image",
    );
    expect(getRun("run-image")?.fileName).toBe("page.png");
  });

  it("dispatches only the FIRST ordered policy on upload, not the whole set", async () => {
    setFileStubs([{ id: "file-1", name: "doc.pdf" }]);
    runStored.mockResolvedValue("run-sec");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    // The first policy (order 0) runs on the upload; the second waits for the chain.
    expect(runStored).toHaveBeenCalledTimes(1);
    // Recorded against a document this browser can resolve, which is what makes its failure actionable.
    expect(runStored).toHaveBeenCalledWith(
      "backend-sec",
      [{ size: 100 }],
      "file-1",
      "background",
    );
  });

  it("chains the next policy onto a completed run's output", async () => {
    // A first-policy run that has completed and imported its output as file-1-v2.
    completeRun("run-sec", "security", "file-1", ["file-1-v2"]);
    runStored.mockResolvedValue("run-comp");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    // Fires on the first policy's output and reports that output's own id, not the original's.
    expect(runStored).toHaveBeenCalledWith(
      "backend-comp",
      [{ size: 100 }],
      "file-1-v2",
      "background",
    );
  });

  it("never chains an annotating (classification) policy - it runs itself", async () => {
    // The last file-producing policy has completed; the engine's chain ends there. Classification
    // is not a wire link in the chain, so nothing dispatches its backend here.
    completeRun("run-comp", "compliance", "file-1", ["file-1-v2"]);
    runStored.mockResolvedValue("run-x");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored).not.toHaveBeenCalledWith(
      "backend-cls",
      expect.anything(),
      expect.anything(),
      "background",
    );
  });

  it("never dispatches on a file marked derivedFromTool", async () => {
    // A policy run is billed, so this gate is what stops `importOutputs` re-enforcing a policy on
    // its own output forever. If this fails, fix the gate rather than the test.
    setFileStubs([
      { id: "file-1", name: "unlocked.pdf", derivedFromTool: true },
    ]);
    runStored.mockResolvedValue("run-sec");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored).not.toHaveBeenCalled();
  });

  it("never polls a browser-local run (no server behind it) so its success can't 404 to FAILED", async () => {
    getRunStatus.mockResolvedValue({
      runId: "srv-1",
      policyId: null,
      status: "COMPLETED",
      currentStep: 1,
      stepCount: 1,
      error: null,
      outputs: [],
    } as never);
    // A browser-local heuristic run and a real server run, both left in flight.
    recordRunStart({
      runId: "local-1",
      policyKey: "classification",
      fileId: "f1",
      fileName: "d.pdf",
      fileSize: 1,
      target: "local",
      browserLocal: true,
      status: "RUNNING",
      outputs: [],
      error: null,
      startedAt: 0,
    });
    recordRunStart({
      runId: "srv-1",
      policyKey: "security",
      fileId: "f2",
      fileName: "d.pdf",
      fileSize: 1,
      target: "saas",
      status: "RUNNING",
      outputs: [],
      error: null,
      startedAt: 0,
    });

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700); // past the first poll (500ms)
    });

    const polled = getRunStatus.mock.calls.map((c) => c[0]);
    expect(polled).toContain("srv-1"); // the server run is polled…
    expect(polled).not.toContain("local-1"); // …the browser-local one never is
    // And its success is left intact, not flipped to FAILED by a 404 streak.
    expect(getRun("local-1")?.status).toBe("RUNNING");
  });
});
