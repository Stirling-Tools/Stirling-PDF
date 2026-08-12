import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Drive a COMPLETED run's import against the REAL run store, stubbing the contexts/network the
// hook reaches into. Spies are hoisted so the vi.mock factories share stable references we can
// assert on. The focus is which delivery path importOutputs takes for "new_version" output:
//  - input in the active workspace  → consumeFiles (versions in place)
//  - input only in storage (reload) → fileStorage.persistVersionedOutputs (+ bumpRevision)
//  - input gone entirely            → addFiles (new file)
const mocks = vi.hoisted(() => ({
  fileStubs: [] as Array<{ id: string }>,
  addFiles: vi.fn(),
  consumeFiles: vi.fn(),
  bumpRevision: vi.fn(),
  persistVersionedOutputs: vi.fn(),
  getStirlingFile: vi.fn(),
  getStirlingFileStub: vi.fn(),
  updateFileMetadata: vi.fn(),
  downloadPolicyOutput: vi.fn(),
  listPolicyRuns: vi.fn(),
  createStirlingFilesAndStubs: vi.fn(),
}));

vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ fileStubs: mocks.fileStubs }),
  useFileManagement: () => ({
    addFiles: mocks.addFiles,
    updateStirlingFileStub: vi.fn(),
  }),
  useFileContext: () => ({ consumeFiles: mocks.consumeFiles }),
}));
vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({ bumpRevision: mocks.bumpRevision }),
}));
vi.mock("@app/hooks/usePolicies", () => ({
  usePolicies: () => ({
    policies: {
      security: {
        configured: true,
        status: "active",
        backendId: "backend-1",
        runOn: "upload",
        outputMode: "new_version",
        outputName: "",
      },
    },
  }),
}));
vi.mock("@app/services/policyApi", () => ({
  runStoredPolicy: vi.fn(),
  getPolicyRun: vi.fn(),
  listPolicyRuns: mocks.listPolicyRuns,
  downloadPolicyOutput: mocks.downloadPolicyOutput,
  resolvePolicyRunTarget: () => "saas",
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: mocks.getStirlingFile,
    getStirlingFileStub: mocks.getStirlingFileStub,
    updateFileMetadata: mocks.updateFileMetadata,
    persistVersionedOutputs: mocks.persistVersionedOutputs,
  },
}));
vi.mock("@app/services/fileStubHelpers", () => ({
  createStirlingFilesAndStubs: mocks.createStirlingFilesAndStubs,
}));

import { usePolicyAutoRun } from "@app/components/policies/usePolicyAutoRun";
import {
  recordRunStart,
  getRun,
  resetPolicyRuns,
} from "@app/components/policies/policyRunStore";

/** Seed a finished run (one output) so the import effect fires on mount. */
function recordCompletedRun() {
  recordRunStart({
    runId: "run-1",
    categoryId: "security",
    fileId: "file-1",
    fileName: "doc.pdf",
    fileSize: 1234,
    target: "saas",
    status: "COMPLETED",
    outputs: [{ fileId: "out-file-1", fileName: "doc.pdf" }],
    error: null,
    startedAt: 0,
  });
}

/** Render the hook and wait for the run's outputs to finish importing. */
async function runImport() {
  renderHook(() => usePolicyAutoRun());
  await act(async () => {
    await vi.waitFor(() => expect(getRun("run-1")?.imported).toBe(true));
  });
}

beforeEach(() => {
  localStorage.clear();
  resetPolicyRuns();
  vi.clearAllMocks();
  mocks.fileStubs = [];
  mocks.listPolicyRuns.mockResolvedValue([]);
  mocks.getStirlingFileStub.mockResolvedValue(null);
  mocks.persistVersionedOutputs.mockResolvedValue(undefined);
  mocks.updateFileMetadata.mockResolvedValue(true);
  mocks.consumeFiles.mockResolvedValue(undefined);
  mocks.addFiles.mockResolvedValue([{ fileId: "out-1" }]);
  mocks.downloadPolicyOutput.mockResolvedValue(
    new Blob(["x"], { type: "application/pdf" }),
  );
  mocks.createStirlingFilesAndStubs.mockResolvedValue({
    stirlingFiles: [{ name: "doc.pdf" }],
    stubs: [{ id: "out-1" }],
  });
});

describe("auto-run import: new-version output delivery", () => {
  it("versions the input in storage when it's recovered after a reload (no second file)", async () => {
    // Reload case: the workspace is empty, but the input still persists in IndexedDB.
    mocks.fileStubs = [];
    mocks.getStirlingFileStub.mockResolvedValue({
      id: "file-1",
      versionNumber: 1,
    });

    recordCompletedRun();
    await runImport();

    expect(mocks.persistVersionedOutputs).toHaveBeenCalledWith(
      ["file-1"],
      expect.any(Array),
      expect.any(Array),
    );
    expect(mocks.bumpRevision).toHaveBeenCalled();
    expect(mocks.consumeFiles).not.toHaveBeenCalled();
    expect(mocks.addFiles).not.toHaveBeenCalled();
  });

  it("versions the input in place SILENTLY when it's open (consumeFiles with silent, + sidebar bump)", async () => {
    mocks.fileStubs = [{ id: "file-1" }];

    recordCompletedRun();
    await runImport();

    // Background enforcement must not disturb the workbench: the silent consume
    // replaces the file in place without auto-selecting / reordering / opening it.
    expect(mocks.consumeFiles).toHaveBeenCalledWith(
      ["file-1"],
      expect.any(Array),
      expect.any(Array),
      { silent: true },
    );
    // No redundant bump in the in-workspace path — the silent consume's own state
    // update drives the sidebar refresh (avoids an O(n) IDB re-read per delivery).
    expect(mocks.bumpRevision).not.toHaveBeenCalled();
    expect(mocks.persistVersionedOutputs).not.toHaveBeenCalled();
    expect(mocks.addFiles).not.toHaveBeenCalled();
  });

  it("falls back to adding a new file when the input is gone from storage too", async () => {
    mocks.fileStubs = [];
    mocks.getStirlingFileStub.mockResolvedValue(null);

    recordCompletedRun();
    await runImport();

    // derivedFromTool must ride along so the auto-run never re-enforces this
    // output, even after the dispatched list is wiped (fresh device / storage
    // clear) — without it the output re-triggers the policy indefinitely.
    expect(mocks.addFiles).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ derivedFromTool: true }),
    );
    expect(mocks.persistVersionedOutputs).not.toHaveBeenCalled();
    expect(mocks.consumeFiles).not.toHaveBeenCalled();
  });

  it("adopts a server-only run for visibility, without delivering its outputs", async () => {
    // A run the client never recorded (true orphan): reconcile adopts it from the server for the
    // activity feed, dated from the server's createdAt (not Date.now()). It is adopted already
    // `imported` — with no local input link a delivery would add its output as a NEW workspace
    // file, and since cap-evicted runs are re-adopted on every refresh, that meant phantom
    // duplicates opening onto the workbench after each reload.
    mocks.listPolicyRuns.mockResolvedValue([
      {
        runId: "srv-1",
        policyId: "backend-1",
        status: "COMPLETED",
        currentStep: 1,
        stepCount: 1,
        error: null,
        outputs: [{ fileId: "out-file-1", fileName: "doc.pdf" }],
        createdAt: 1000,
      },
    ]);

    renderHook(() => usePolicyAutoRun());
    await act(async () => {
      await vi.waitFor(() => expect(getRun("srv-1")?.imported).toBe(true));
    });

    expect(getRun("srv-1")?.startedAt).toBe(1000);
    expect(mocks.addFiles).not.toHaveBeenCalled();
    expect(mocks.downloadPolicyOutput).not.toHaveBeenCalled();
    expect(mocks.persistVersionedOutputs).not.toHaveBeenCalled();
  });
});
