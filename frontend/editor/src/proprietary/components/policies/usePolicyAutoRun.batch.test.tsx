import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * Batch integration test for the policy auto-run orchestration, at the scale the
 * user hit the bug: 61 files uploaded at once, two active upload policies
 * (Classification → Security) chained. Drives the REAL policyRunStore + the REAL
 * hook effects (dispatch → poll → import → chain), mocking only the IO boundaries
 * (network, storage, thumbnail/stub creation).
 *
 * Proves the invariants the user asked for:
 *  - 61 files ⇒ exactly 122 runs (61 classification, then 61 security).
 *  - Delivery is SILENT + in place (consumeFiles called with { silent: true }),
 *    never adding a second copy — the workspace never grows past 61.
 *  - No runaway: if the loop guard regressed, the run count would blow past 122
 *    (or the test would time out), so an exact 122 is a hard regression gate.
 *  - Closing all files mid-run does NOT re-open them: with the workspace emptied,
 *    outputs are delivered to storage (persistVersionedOutputs), never re-added
 *    to the workspace via consumeFiles.
 */

const FILE_COUNT = 61;

// A tiny mutable "workspace" the mocks share: the list of file stubs currently in
// the workbench, mirrored into useAllFiles. consumeFiles mutates it in place
// (input id → output id) exactly as the real silent reducer would.
const mocks = vi.hoisted(() => ({
  workspace: [] as Array<{ id: string }>,
  consumeSilentCalls: 0,
  consumeNonSilentCalls: 0,
  persistCalls: 0,
  addFilesCalls: 0,
  stubCounter: 0,
  backendOutCounter: 0,
  bumpRevision: vi.fn(),
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
}));

vi.mock("@app/constants/featureFlags", () => ({ POLICIES_ENABLED: true }));
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
      // Classification runs first (order 0), Security second (order 1).
      classification: {
        configured: true,
        status: "active",
        backendId: "backend-classification",
        runOn: "upload",
        order: 0,
        outputMode: "new_version",
        outputName: "",
      },
      security: {
        configured: true,
        status: "active",
        backendId: "backend-security",
        runOn: "upload",
        order: 1,
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
  readClassificationLabelsFromFile: vi.fn().mockResolvedValue(null),
}));

import { usePolicyAutoRun } from "@app/components/policies/usePolicyAutoRun";
import {
  usePolicyRuns,
  resetPolicyRuns,
} from "@app/components/policies/policyRunStore";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

/** A stable snapshot of the store, read after the flow settles. */
let latestRuns: PolicyRunRecord[] = [];
function Harness() {
  usePolicyAutoRun();
  latestRuns = usePolicyRuns();
  return null;
}

function replaceInWorkspace(inputIds: string[], outputIds: string[]) {
  mocks.workspace = mocks.workspace
    .filter((s) => !inputIds.includes(s.id))
    .concat(outputIds.map((id) => ({ id })));
}

beforeEach(() => {
  localStorage.clear();
  resetPolicyRuns();
  vi.clearAllMocks();
  mocks.consumeSilentCalls = 0;
  mocks.consumeNonSilentCalls = 0;
  mocks.persistCalls = 0;
  mocks.addFilesCalls = 0;
  mocks.stubCounter = 0;
  mocks.backendOutCounter = 0;

  mocks.workspace = Array.from({ length: FILE_COUNT }, (_, i) => ({
    id: `file-${i}`,
  }));

  mocks.listPolicyRuns.mockResolvedValue([]);
  // A run's bytes are always resolvable (input files + versioned children).
  mocks.getStirlingFile.mockResolvedValue(
    new File(["x"], "doc.pdf", { type: "application/pdf" }),
  );
  mocks.getStirlingFileStub.mockResolvedValue(null);
  mocks.persistVersionedOutputs.mockImplementation(async () => {
    mocks.persistCalls += 1;
  });
  mocks.updateFileMetadata.mockResolvedValue(false);
  mocks.downloadPolicyOutput.mockResolvedValue(
    new Blob(["x"], { type: "application/pdf" }),
  );

  // Each dispatch gets a unique run id; the run's single backend output likewise.
  mocks.runStoredPolicy.mockImplementation(
    async () => `run-${mocks.stubCounter++}`,
  );
  mocks.getPolicyRun.mockImplementation(async (runId: string) => ({
    runId,
    policyId: null,
    status: "COMPLETED",
    currentStep: 1,
    stepCount: 1,
    error: null,
    outputs: [
      {
        fileId: `backend-out-${mocks.backendOutCounter++}`,
        fileName: "doc.pdf",
      },
    ],
  }));
  // Deliver a unique workspace child stub per output, derived from the parent so
  // the chain's second policy can find + version it.
  mocks.createStirlingFilesAndStubs.mockImplementation(
    async (files: File[], parentStub: { id: string }) => {
      const stubs = files.map(() => ({
        id: `${parentStub.id}~${mocks.stubCounter++}`,
      }));
      return { stirlingFiles: files, stubs };
    },
  );
  mocks.addFiles.mockImplementation(async (files: File[]) => {
    mocks.addFilesCalls += 1;
    return files.map((_f, i) => ({
      fileId: `added-${mocks.stubCounter++}-${i}`,
    }));
  });
  mocks.consumeFiles.mockImplementation(
    async (
      inputIds: string[],
      _outputs: unknown[],
      stubs: Array<{ id: string }>,
      options?: { silent?: boolean },
    ) => {
      if (options?.silent) mocks.consumeSilentCalls += 1;
      else mocks.consumeNonSilentCalls += 1;
      replaceInWorkspace(
        inputIds,
        stubs.map((s) => s.id),
      );
    },
  );
});

/** Drive the hook until the store shows the expected number of imported runs. */
async function runUntilSettled(expectedRuns: number) {
  renderHook(() => Harness());
  await act(async () => {
    await vi.waitFor(
      () => {
        const imported = latestRuns.filter((r) => r.imported).length;
        expect(imported).toBe(expectedRuns);
      },
      { timeout: 8000, interval: 20 },
    );
  });
}

describe("policy auto-run — 61-file batch through a Classification → Security chain", () => {
  it("produces exactly 122 runs (61 classification, then 61 security)", async () => {
    await runUntilSettled(FILE_COUNT * 2);

    const classification = latestRuns.filter(
      (r) => r.categoryId === "classification",
    );
    const security = latestRuns.filter((r) => r.categoryId === "security");

    expect(classification).toHaveLength(FILE_COUNT);
    expect(security).toHaveLength(FILE_COUNT);
    expect(latestRuns).toHaveLength(FILE_COUNT * 2);
  });

  it("delivers every output SILENTLY in place — workspace never grows past 61", async () => {
    await runUntilSettled(FILE_COUNT * 2);

    // 122 deliveries, all silent (background), none via the disruptive path.
    expect(mocks.consumeSilentCalls).toBe(FILE_COUNT * 2);
    expect(mocks.consumeNonSilentCalls).toBe(0);
    // Never added as brand-new files either.
    expect(mocks.addFilesCalls).toBe(0);
    // In-place versioning: each file replaced twice, count unchanged.
    expect(mocks.workspace).toHaveLength(FILE_COUNT);
  });

  it("does NOT re-open files that were closed while their runs were in flight", async () => {
    renderHook(() => Harness());
    // Close everything immediately — as if the user cleared the workbench mid-run.
    // The inputs still persist in storage, so getStirlingFileStub resolves them.
    mocks.getStirlingFileStub.mockResolvedValue({
      id: "storage",
      versionNumber: 1,
    });
    act(() => {
      mocks.workspace = [];
    });

    await act(async () => {
      await vi.waitFor(
        () => {
          const imported = latestRuns.filter((r) => r.imported).length;
          expect(imported).toBe(FILE_COUNT * 2);
        },
        { timeout: 8000, interval: 20 },
      );
    });

    // Still fully processed (chain intact), but delivered to STORAGE, never
    // re-added to the workbench — the workspace stays empty.
    expect(latestRuns).toHaveLength(FILE_COUNT * 2);
    expect(mocks.workspace).toHaveLength(0);
    expect(mocks.consumeSilentCalls).toBe(0);
    expect(mocks.persistCalls).toBeGreaterThan(0);
  });
});
