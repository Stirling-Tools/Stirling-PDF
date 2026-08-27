import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Two active upload policies, so the auto-run should CHAIN them: fire the first on
// the upload, then the second on the first's output. Stub the contexts + network so
// we can drive the dispatch against the REAL run store.
// Controllable AI-engine flag: on by default so classification chains server-side; one
// test flips it off to assert classification is kept OUT of the server chain.
const aiEnabled = vi.hoisted(() => ({ value: true }));
vi.mock("@app/hooks/useAiEngineEnabled", () => ({
  useAiEngineEnabled: () => aiEnabled.value,
}));
const fileStubs: {
  id: string;
  name: string;
  derivedFromTool?: boolean;
  classificationLabels?: string[];
  classificationConfidence?: "none" | "low" | "medium" | "high";
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
import { runStoredPolicy, getPolicyRun } from "@app/services/policyApi";
import { fileStorage } from "@app/services/fileStorage";

const runStored = vi.mocked(runStoredPolicy);
const getPolicyRunMock = vi.mocked(getPolicyRun);
const getFile = vi.mocked(fileStorage.getStirlingFile);

/** Reset the shared file list between tests without swapping the array identity. */
function setFileStubs(next: typeof fileStubs) {
  fileStubs.length = 0;
  fileStubs.push(...next);
}

/** A completed security run whose imported output is file-1-v2, ready to chain from. */
function seedCompletedSecurityRun() {
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
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetPolicyRuns();
  setFileStubs([]);
  aiEnabled.value = true;
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
    // Recorded against a document this browser can resolve, which is what makes its failure actionable.
    expect(runStored).toHaveBeenCalledWith(
      "backend-sec",
      [{ size: 100 }],
      "file-1",
    );
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

    // Fires on the first policy's output and reports that output's own id, not the original's.
    expect(runStored).toHaveBeenCalledWith(
      "backend-cls",
      [{ size: 100 }],
      "file-1-v2",
    );
  });

  it("escalates a chained output that carries no verdict", async () => {
    // The output stub is in the workspace shaped as a new_file-mode delivery (or a
    // version made before the upload's verdict landed) produces it: tool-derived,
    // labels inherited, NO classificationConfidence. No local pass ever runs on a
    // derived file, so waiting for a verdict would skip classification forever —
    // it must dispatch to the engine instead.
    seedCompletedSecurityRun();
    setFileStubs([
      {
        id: "file-1-v2",
        name: "doc.pdf",
        derivedFromTool: true,
        classificationLabels: ["invoice"],
      },
    ]);
    runStored.mockResolvedValue("run-cls");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored).toHaveBeenCalledWith(
      "backend-cls",
      [{ size: 100 }],
      "file-1-v2",
    );
  });

  it("chains classification onto an output that inherited an unsure verdict", async () => {
    // The default (new_version) delivery: createChildStub copies the parent's
    // verdict onto the output, so a low confidence rides through and escalates.
    seedCompletedSecurityRun();
    setFileStubs([
      {
        id: "file-1-v2",
        name: "doc.pdf",
        derivedFromTool: true,
        classificationLabels: ["invoice"],
        classificationConfidence: "low",
      },
    ]);
    runStored.mockResolvedValue("run-cls");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored).toHaveBeenCalledWith(
      "backend-cls",
      [{ size: 100 }],
      "file-1-v2",
    );
  });

  it("lets an inherited confident verdict stand — no engine call for the chained output", async () => {
    seedCompletedSecurityRun();
    setFileStubs([
      {
        id: "file-1-v2",
        name: "doc.pdf",
        derivedFromTool: true,
        classificationLabels: ["invoice"],
        classificationConfidence: "high",
      },
    ]);
    runStored.mockResolvedValue("run-cls");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(
      runStored.mock.calls.some(([backendId]) => backendId === "backend-cls"),
    ).toBe(false);
  });

  it("still escalates after the local pass has recorded its own run for the file", async () => {
    // The regression that made the whole escalation dead in practice: the local heuristic records
    // a run for the SAME (classification, file) pair, and recordRunStart claims the dispatch key.
    // The auto-run then reads "already dispatched" and skips the server run forever. A
    // browser-local run must not claim that key - it is the first pass, not the policy's run.
    seedCompletedSecurityRun();
    // The local pass ran on the chained output and recorded its own run for it.
    recordRunStart({
      runId: "local-classification-file-1-v2-123",
      categoryId: "classification",
      fileId: "file-1-v2",
      fileName: "doc.pdf",
      fileSize: 100,
      target: "local",
      browserLocal: true,
      status: "COMPLETED",
      outputs: [],
      error: null,
      startedAt: 0,
    });
    // Its verdict was unsure, so the AI must still be asked.
    setFileStubs([
      {
        id: "file-1-v2",
        name: "doc.pdf",
        derivedFromTool: true,
        classificationConfidence: "low",
      },
    ]);
    runStored.mockResolvedValue("run-cls");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored).toHaveBeenCalledWith(
      "backend-cls",
      [{ size: 100 }],
      "file-1-v2",
    );
  });

  it("does not poll a browser-local run against the server", async () => {
    // There is no server-side run to ask about: polling 404s, and MAX_NOT_FOUND consecutive
    // misses would mark a local run that actually succeeded as FAILED.
    recordRunStart({
      runId: "local-classification-file-9-456",
      categoryId: "classification",
      fileId: "file-9",
      fileName: "doc.pdf",
      fileSize: 100,
      target: "local",
      browserLocal: true,
      status: "RUNNING",
      outputs: [],
      error: null,
      startedAt: 0,
    });
    setFileStubs([]);

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(getPolicyRunMock).not.toHaveBeenCalled();
  });

  it("keeps classification out of the server chain when the AI engine is off", async () => {
    // AI off: classification runs client-side (useClientSideClassification), so the
    // server chain must skip it - only the normal (security) policy dispatches.
    aiEnabled.value = false;
    setFileStubs([{ id: "file-1", name: "doc.pdf" }]);
    runStored.mockResolvedValue("run-sec");

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(runStored).toHaveBeenCalledWith(
      "backend-sec",
      [{ size: 100 }],
      "file-1",
    );
    expect(
      runStored.mock.calls.some(([backendId]) => backendId === "backend-cls"),
    ).toBe(false);
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
});
