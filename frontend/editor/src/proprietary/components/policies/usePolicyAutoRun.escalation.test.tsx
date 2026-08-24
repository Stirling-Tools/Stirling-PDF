/**
 * The default shipped setup: Classification is the ONLY upload policy, so it dispatches directly
 * on the upload rather than through the chain. This is the configuration the escalation was built
 * for, and the one where it was completely dead: the browser-side first pass records its own run
 * for the same (classification, file) pair, and recordRunStart claims the dispatch key, so the
 * auto-run read "already dispatched" and never asked the AI - whatever the verdict said.
 *
 * Driven against the REAL run store; mocking the store is what let the regression through.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@app/hooks/useAiEngineEnabled", () => ({
  useAiEngineEnabled: () => true,
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
      classification: {
        configured: true,
        status: "active",
        backendId: "backend-cls",
        runOn: "upload",
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
import {
  recordRunStart,
  resetPolicyRuns,
} from "@app/components/policies/policyRunStore";
import { runStoredPolicy } from "@app/services/policyApi";
import { fileStorage } from "@app/services/fileStorage";

const runStored = vi.mocked(runStoredPolicy);
const getFile = vi.mocked(fileStorage.getStirlingFile);

function setFileStubs(next: typeof fileStubs) {
  fileStubs.length = 0;
  fileStubs.push(...next);
}

/**
 * Exactly what useClientSideClassification does when its heuristic pass finishes: a run row for
 * the activity feed, categorised as classification, for the file it just read.
 */
function recordLocalPassFor(fileId: string) {
  recordRunStart({
    runId: `local-classification-${fileId}-1`,
    categoryId: "classification",
    fileId,
    fileName: "low-confidence-classification-test.pdf",
    fileSize: 1460,
    target: "local",
    browserLocal: true,
    status: "COMPLETED",
    outputs: [],
    error: null,
    startedAt: 0,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetPolicyRuns();
  runStored.mockReset();
  runStored.mockResolvedValue("run-cls");
  getFile.mockReset();
  getFile.mockResolvedValue({ size: 1460 } as never);
  setFileStubs([]);
});
afterEach(() => vi.useRealTimers());

async function render() {
  renderHook(() => usePolicyAutoRun());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}

describe("classification escalation (single-policy setup)", () => {
  it("asks the AI about an unsure verdict even though the local pass already ran", async () => {
    // low-confidence-classification-test.pdf: the heuristic emits labels but only at "low".
    recordLocalPassFor("file-1");
    setFileStubs([
      {
        id: "file-1",
        name: "low-confidence-classification-test.pdf",
        classificationLabels: ["contract", "invoice"],
        classificationConfidence: "low",
      },
    ]);

    await render();

    expect(runStored).toHaveBeenCalledWith("backend-cls", [{ size: 1460 }]);
  });

  it("leaves a confident local verdict alone (no engine call, no charge)", async () => {
    recordLocalPassFor("file-2");
    setFileStubs([
      {
        id: "file-2",
        name: "invoice.pdf",
        classificationLabels: ["invoice"],
        classificationConfidence: "high",
      },
    ]);

    await render();

    expect(runStored).not.toHaveBeenCalled();
  });

  it("waits for the verdict rather than racing the local pass", async () => {
    // No verdict yet on a plain upload: dispatching now would pay for an answer the free
    // first pass is about to produce. The effect re-runs when the verdict lands.
    setFileStubs([{ id: "file-3", name: "unknown.pdf" }]);

    await render();

    expect(runStored).not.toHaveBeenCalled();
  });
});
