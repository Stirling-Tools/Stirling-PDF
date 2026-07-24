import { describe, it, expect, vi, beforeEach } from "vitest";
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

  mocks.workspace = [{ id: "file-0" }];

  mocks.listPolicyRuns.mockResolvedValue([]);
  mocks.getStirlingFile.mockResolvedValue(
    new File(["x"], "doc.pdf", { type: "application/pdf" }),
  );
  mocks.getStirlingFileStub.mockResolvedValue(null);
  mocks.updateFileMetadata.mockResolvedValue(true);
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

async function settleImport() {
  await act(async () => {
    await vi.waitFor(
      () => {
        expect(latestRuns.filter((r) => r.imported)).toHaveLength(1);
      },
      { timeout: 8000, interval: 20 },
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
});
