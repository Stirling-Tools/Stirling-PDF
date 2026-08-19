import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * Mid-run race: classification is in flight (its labelled output is still
 * downloading) when the user manually runs a tool on the same file — e.g.
 * quickly redacting it — which consumes the input and forks a new leaf.
 *
 * The label targets must be resolved AT WRITE TIME (after the download/parse
 * window), not snapshotted at run completion: a stale snapshot points at the
 * consumed id, no-ops, and silently loses the labels — the file then shows the
 * classification badge (provenance-resolved) but never gets its labels.
 */

const mocks = vi.hoisted(() => ({
  workspace: [] as Array<{
    id: string;
    sourceFileIds?: string[];
    derivedFromTool?: boolean;
    classificationLabels?: string[];
    classificationConfidence?: "none" | "low" | "medium" | "high";
  }>,
  runStoredPolicy: vi.fn(),
  getPolicyRun: vi.fn(),
  listPolicyRuns: vi.fn(),
  downloadPolicyOutput: vi.fn(),
  getStirlingFile: vi.fn(),
  getStirlingFileStub: vi.fn(),
  persistVersionedOutputs: vi.fn(),
  updateFileMetadata: vi.fn(),
  createStirlingFilesAndStubs: vi.fn(),
  addFiles: vi.fn(),
  updateStirlingFileStub: vi.fn(),
  consumeFiles: vi.fn(),
  bumpRevision: vi.fn(),
}));

// Classification chains server-side only when the AI engine is on (else it runs
// client-side); this race is in the server import path, so force the engine on.
vi.mock("@app/hooks/useAiEngineEnabled", () => ({
  useAiEngineEnabled: () => true,
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ fileStubs: mocks.workspace }),
  useFileManagement: () => ({
    addFiles: mocks.addFiles,
    updateStirlingFileStub: mocks.updateStirlingFileStub,
  }),
  useFileContext: () => ({ consumeFiles: mocks.consumeFiles }),
}));
vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({ bumpRevision: mocks.bumpRevision }),
}));
vi.mock("@app/hooks/usePolicies", () => ({
  usePolicies: () => ({
    policies: {
      classification: {
        configured: true,
        status: "active",
        backendId: "backend-classification",
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
  downloadPolicyOutput: mocks.downloadPolicyOutput,
  resolvePolicyRunTarget: () => "saas",
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: mocks.getStirlingFile,
    getStirlingFileStub: mocks.getStirlingFileStub,
    persistVersionedOutputs: mocks.persistVersionedOutputs,
    updateFileMetadata: mocks.updateFileMetadata,
  },
}));
vi.mock("@app/services/fileStubHelpers", () => ({
  createStirlingFilesAndStubs: mocks.createStirlingFilesAndStubs,
}));
vi.mock("@app/services/fileClassification", () => ({
  readClassificationLabelsFromFile: vi.fn().mockResolvedValue(["Invoice"]),
}));

import { usePolicyAutoRun } from "@app/components/policies/usePolicyAutoRun";
import {
  usePolicyRuns,
  resetPolicyRuns,
} from "@app/components/policies/policyRunStore";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

let latestRuns: PolicyRunRecord[] = [];
function Harness() {
  usePolicyAutoRun();
  latestRuns = usePolicyRuns();
  return null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  localStorage.clear();
  resetPolicyRuns();
  vi.clearAllMocks();

  mocks.workspace = [{ id: "file-0", classificationConfidence: "low" }];

  mocks.listPolicyRuns.mockResolvedValue([]);
  mocks.getStirlingFile.mockResolvedValue(
    new File(["x"], "doc.pdf", { type: "application/pdf" }),
  );
  mocks.getStirlingFileStub.mockResolvedValue(null);
  mocks.updateFileMetadata.mockResolvedValue(true);
  // Apply stub updates to the shared workspace, as the real reducer does — the
  // label stamp's second pass reads them back to stay idempotent.
  mocks.updateStirlingFileStub.mockImplementation(
    (id: string, updates: Record<string, unknown>) => {
      const stub = mocks.workspace.find((s) => s.id === id);
      if (stub) Object.assign(stub, updates);
    },
  );
  mocks.runStoredPolicy.mockResolvedValue("run-0");
  mocks.getPolicyRun.mockResolvedValue({
    runId: "run-0",
    policyId: null,
    status: "COMPLETED",
    currentStep: 1,
    stepCount: 1,
    error: null,
    outputs: [{ fileId: "backend-out-0", fileName: "doc.pdf" }],
  });
});

async function settleImport(timeout = 8000) {
  await act(async () => {
    await vi.waitFor(
      () => {
        expect(latestRuns.filter((r) => r.imported)).toHaveLength(1);
      },
      { timeout, interval: 20 },
    );
  });
}

describe("classification vs a mid-run manual tool edit", () => {
  it("labels land on the forked leaf when a tool consumes the file during the label download", async () => {
    // The classified output's download hangs until we release it — this is the
    // async window the user's edit slips into.
    const download = deferred<Blob>();
    mocks.downloadPolicyOutput.mockReturnValue(download.promise);

    const { rerender } = renderHook(() => Harness());

    // Run dispatched, completed, import started — now hanging in the window.
    await act(async () => {
      await vi.waitFor(
        () => expect(mocks.downloadPolicyOutput).toHaveBeenCalled(),
        { timeout: 8000, interval: 20 },
      );
    });

    // User quickly redacts: the tool consumes file-0 and forks a new leaf.
    // (derivedFromTool + sourceFileIds are what CONSUME_FILES stamps.)
    act(() => {
      mocks.workspace = [
        {
          id: "file-0~redacted",
          sourceFileIds: ["file-0"],
          derivedFromTool: true,
        },
      ];
      rerender();
    });

    // The download finally lands.
    download.resolve(new Blob(["x"], { type: "application/pdf" }));
    await settleImport();

    // Labels stamped onto the LIVE leaf, not no-oped on the consumed id.
    const stampedIds = mocks.updateStirlingFileStub.mock.calls.map((c) => c[0]);
    expect(stampedIds).toEqual(["file-0~redacted"]);
    expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith(
      "file-0~redacted",
      { classificationLabels: ["Invoice"] },
    );
    // Badge persists on the leaf: the run's outputFileIds are the tagged files.
    expect(latestRuns[0].outputFileIds).toEqual(["file-0~redacted"]);
  });

  it("control: with no mid-run edit, labels land on the original file", async () => {
    mocks.downloadPolicyOutput.mockResolvedValue(
      new Blob(["x"], { type: "application/pdf" }),
    );

    renderHook(() => Harness());
    await settleImport();

    expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("file-0", {
      classificationLabels: ["Invoice"],
    });
    expect(latestRuns[0].outputFileIds).toEqual(["file-0"]);
  });

  it("stamps the forked leaf when the consume lands in the same frame as the first stamp", async () => {
    // Tighter than the case above: the consume is dispatched but hasn't rendered
    // when the labels are stamped, so the workspace snapshot still shows file-0
    // and that stamp no-ops against the real reducer. The post-commit second pass
    // is what saves the labels.
    mocks.downloadPolicyOutput.mockResolvedValue(
      new Blob(["x"], { type: "application/pdf" }),
    );
    mocks.updateStirlingFileStub.mockImplementation((id: string) => {
      // file-0 is already consumed, so its stamp is lost (no Object.assign) and
      // the forked leaf only becomes visible afterwards. Mutate the workspace in
      // place: the hook holds it by ref, which is what the second pass re-reads.
      if (id === "file-0") {
        mocks.workspace.splice(0, mocks.workspace.length, {
          id: "file-0~redacted",
          sourceFileIds: ["file-0"],
        });
        return;
      }
      const stub = mocks.workspace.find((s) => s.id === id);
      if (stub) Object.assign(stub, { classificationLabels: ["Invoice"] });
    });

    renderHook(() => Harness());
    await settleImport();

    const stampedIds = mocks.updateStirlingFileStub.mock.calls.map((c) => c[0]);
    expect(stampedIds).toEqual(["file-0", "file-0~redacted"]);
    // The leaf becoming visible also queues its own classification run, so pick
    // the settled one rather than assuming an index.
    const imported = latestRuns.find((r) => r.imported);
    expect(imported?.outputFileIds).toContain("file-0~redacted");
  });
});

// The label read backs off between attempts (2s, then 4s), so these run on fake
// timers — sleeping for real would hold a worker long enough to starve the suite.
describe("classification label-read failures", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function settleOnFakeTime(maxMs = 30_000) {
    for (let elapsed = 0; elapsed < maxMs; elapsed += 250) {
      if (latestRuns.some((r) => r.imported)) return;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
    }
    throw new Error("classification run never settled");
  }

  it("retries a transient failure instead of leaving the run unsettled", async () => {
    // The import effect only re-runs when the run store changes, so bailing out
    // on a transient failure would leave this run "running" forever.
    mocks.downloadPolicyOutput
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValue(new Blob(["x"], { type: "application/pdf" }));

    renderHook(() => Harness());
    await settleOnFakeTime();

    expect(mocks.downloadPolicyOutput).toHaveBeenCalledTimes(2);
    expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("file-0", {
      classificationLabels: ["Invoice"],
    });
  });

  it("settles a run whose labels never become readable", async () => {
    // Permanent failure: give up after the retry budget and settle unlabelled,
    // rather than spinning the file's "running" pill indefinitely.
    mocks.downloadPolicyOutput.mockRejectedValue(new Error("network down"));

    renderHook(() => Harness());
    await settleOnFakeTime();

    expect(mocks.updateStirlingFileStub).not.toHaveBeenCalled();
    expect(latestRuns.find((r) => r.imported)?.outputFileIds).toEqual([]);
  });
});
