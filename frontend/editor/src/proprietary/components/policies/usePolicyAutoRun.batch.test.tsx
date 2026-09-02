import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ClassificationConfidence } from "@app/types/fileContext";

/**
 * Batch integration test (61 files, Security then Classification) driving the real store + both
 * hooks, IO mocked. The auto-run engine dispatches the file-producing Security policy and versions
 * its output in place; the Classification policy runs itself (useClassificationPolicy) on each settled
 * output - here a confident local verdict, so it stamps labels without escalating to the AI.
 */

const FILE_COUNT = 61;

// A tiny mutable "workspace" the mocks share: the list of file stubs currently in
// the workbench, mirrored into useAllFiles. consumeFiles mutates it in place
// (input id → output id) exactly as the real silent reducer would.
const mocks = vi.hoisted(() => ({
  workspace: [] as Array<{
    id: string;
    name?: string;
    size?: number;
    derivedFromTool?: boolean;
    classificationLabels?: string[];
    classificationConfidence?: ClassificationConfidence;
  }>,
  consumeSilentCalls: 0,
  consumeNonSilentCalls: 0,
  persistCalls: 0,
  addFilesCalls: 0,
  stubCounter: 0,
  backendOutCounter: 0,
  dispatchInFlight: 0,
  maxDispatchInFlight: 0,
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
  classify: vi.fn(),
  meter: vi.fn(),
}));

// The second (file-producing) policy's timing, flippable per test to prove classification's local
// pass is independent of when the rewriter runs.
const securityRunOn = vi.hoisted(() => ({
  value: "upload" as "upload" | "export",
}));

vi.mock("@app/hooks/useAiEngineEnabled", () => ({
  useAiEngineEnabled: () => true,
}));
vi.mock("@app/hooks/useClassificationEnabled", () => ({
  useClassificationEnabled: () => true,
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: {}, loading: false }),
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
        runsOnEditor: true,
        enabled: true,
        backendId: "backend-classification",
        runOn: "upload",
        order: 0,
        outputMode: "new_version",
        outputName: "",
      },
      security: {
        configured: true,
        runsOnEditor: true,
        enabled: true,
        backendId: "backend-security",
        runOn: securityRunOn.value,
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
  // The AI import path (if ever reached) resolves labels from the output PDF.
  readClassificationLabelsFromFile: vi.fn().mockResolvedValue(["Invoice"]),
}));
vi.mock("@app/services/heuristic/heuristicClassification", () => ({
  classifyFileHeuristically: (file: File) => mocks.classify(file),
}));
vi.mock("@app/services/classificationMeter", () => ({
  meterClassificationRun: (payload: unknown) => mocks.meter(payload),
}));

import { usePolicyAutoRun } from "@app/components/policies/usePolicyAutoRun";
import { usePolicyLocalPasses } from "@app/components/policies/usePolicyLocalPasses";
import {
  usePolicyRuns,
  resetPolicyRuns,
} from "@app/components/policies/policyRunStore";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

// Run idle callbacks immediately so the local-pass engine's batches start without timer waits.
vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
  cb();
  return 1;
});
vi.stubGlobal("cancelIdleCallback", () => {});

/** A stable snapshot of the store, read after the flow settles. */
let latestRuns: PolicyRunRecord[] = [];
function Harness() {
  usePolicyAutoRun();
  usePolicyLocalPasses();
  latestRuns = usePolicyRuns();
  return null;
}

function replaceInWorkspace(inputIds: string[], outputIds: string[]) {
  // A versioned output inherits its input's classification verdict, exactly as the real CONSUME_FILES
  // reducer does - so a label put on the upload rides forward without re-classifying the output.
  const donor = mocks.workspace.find((s) => inputIds.includes(s.id));
  mocks.workspace = mocks.workspace
    .filter((s) => !inputIds.includes(s.id))
    .concat(
      outputIds.map((id) => ({
        id,
        name: "doc.pdf",
        derivedFromTool: true,
        classificationLabels: donor?.classificationLabels,
        classificationConfidence: donor?.classificationConfidence,
      })),
    );
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
  mocks.dispatchInFlight = 0;
  mocks.maxDispatchInFlight = 0;
  securityRunOn.value = "upload";

  mocks.workspace = Array.from({ length: FILE_COUNT }, (_, i) => ({
    id: `file-${i}`,
    name: `doc-${i}.pdf`,
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
  mocks.updateFileMetadata.mockResolvedValue(true);
  mocks.downloadPolicyOutput.mockResolvedValue(
    new Blob(["x"], { type: "application/pdf" }),
  );
  // A confident local verdict: classification stamps labels and does NOT escalate to the AI.
  mocks.classify.mockResolvedValue({
    labels: ["Invoice"],
    confidence: "high",
    isEnglish: true,
    score: 5,
  });
  // Apply stub updates to the shared workspace, as the real reducer does.
  mocks.updateStirlingFileStub.mockImplementation(
    (id: string, updates: Record<string, unknown>) => {
      const stub = mocks.workspace.find((s) => s.id === id);
      if (stub) Object.assign(stub, updates);
    },
  );

  // Each dispatch gets a unique run id; the run's single backend output likewise.
  // Takes real time so overlapping dispatches are measurable (the upload window).
  mocks.runStoredPolicy.mockImplementation(async () => {
    mocks.dispatchInFlight++;
    mocks.maxDispatchInFlight = Math.max(
      mocks.maxDispatchInFlight,
      mocks.dispatchInFlight,
    );
    await new Promise((resolve) => setTimeout(resolve, 2));
    mocks.dispatchInFlight--;
    return `run-${mocks.stubCounter++}`;
  });
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
  // classification can find + tag it.
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

/** Drive the hooks until the store shows the expected number of imported runs. */
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

describe("policy auto-run — 61-file batch through a Security → Classification chain", () => {
  it("produces exactly 122 runs (61 security, then 61 classification)", async () => {
    await runUntilSettled(FILE_COUNT * 2);

    const classification = latestRuns.filter(
      (r) => r.categoryId === "classification",
    );
    const security = latestRuns.filter((r) => r.categoryId === "security");

    expect(classification).toHaveLength(FILE_COUNT);
    expect(security).toHaveLength(FILE_COUNT);
    expect(latestRuns).toHaveLength(FILE_COUNT * 2);
    // A confident local verdict stands on its own: no AI dispatch for classification.
    expect(classification.every((r) => r.target === "local")).toBe(true);
  });

  it("bounds concurrent dispatch uploads so polls/downloads keep connections", async () => {
    await runUntilSettled(FILE_COUNT * 2);
    expect(mocks.maxDispatchInFlight).toBeGreaterThan(1); // still parallel…
    expect(mocks.maxDispatchInFlight).toBeLessThanOrEqual(4); // …but windowed
  });

  it("versions on Security in place, tags on Classification — workspace never grows past 61", async () => {
    await runUntilSettled(FILE_COUNT * 2);

    // Only the 61 Security runs fork a version, and every one silently in place.
    expect(mocks.consumeSilentCalls).toBe(FILE_COUNT);
    expect(mocks.consumeNonSilentCalls).toBe(0);
    // Classification never forks a version — it only stamps labels onto the stub.
    expect(mocks.updateStirlingFileStub).toHaveBeenCalledTimes(FILE_COUNT);
    for (const call of mocks.updateStirlingFileStub.mock.calls) {
      expect(call[1]).toEqual({
        classificationLabels: ["Invoice"],
        classificationConfidence: "high",
      });
    }
    // Never added as brand-new files either.
    expect(mocks.addFilesCalls).toBe(0);
    // In-place versioning + metadata-only tagging: count unchanged.
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
          const security = latestRuns.filter(
            (r) => r.categoryId === "security" && r.imported,
          );
          expect(security).toHaveLength(FILE_COUNT);
        },
        { timeout: 8000, interval: 20 },
      );
    });

    // Security's versions went to STORAGE, never re-added to the workbench, so the
    // workspace stays empty. (Classification may have tagged the few files still open
    // when the workbench was cleared; the point here is the runner does not re-open them.)
    expect(mocks.workspace).toHaveLength(0);
    expect(mocks.consumeSilentCalls).toBe(0);
    expect(mocks.persistCalls).toBeGreaterThan(0);
  });

  it("classifies uploads even when the other editor policy runs on export, not upload", async () => {
    // Repro: with a file-producing policy set to export, the auto-run engine dispatches nothing on
    // upload - but classification's local pass is independent and must still run on every upload.
    securityRunOn.value = "export";

    renderHook(() => Harness());
    await act(async () => {
      await vi.waitFor(
        () => {
          const classification = latestRuns.filter(
            (r) => r.categoryId === "classification" && r.imported,
          );
          expect(classification).toHaveLength(FILE_COUNT);
        },
        { timeout: 8000, interval: 20 },
      );
    });

    // The export policy did not run on upload; nothing versioned in place.
    expect(latestRuns.filter((r) => r.categoryId === "security")).toHaveLength(
      0,
    );
    expect(mocks.consumeSilentCalls).toBe(0);
  });
});
