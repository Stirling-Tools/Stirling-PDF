// The Classification policy hook: classifies each settled document locally and escalates an unsure
// verdict to the AI engine itself. Drives the real policyRunStore and mocks only IO (storage, the
// heuristic engine, the meter, the shared dispatch primitive).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  markDispatched,
  resetPolicyRuns,
} from "@app/components/policies/policyRunStore";

interface TestStub {
  id: string;
  name: string;
  lastModified: number;
  derivedFromTool?: boolean;
  classificationLabels?: string[];
}

const aiEnabled = vi.hoisted(() => ({ value: false }));
const runOn = vi.hoisted(() => ({ value: "upload" as "upload" | "export" }));

const mocks = vi.hoisted(() => ({
  workspace: [] as Array<{
    id: string;
    name: string;
    lastModified: number;
    derivedFromTool?: boolean;
    classificationLabels?: string[];
  }>,
  configLoading: false,
  updateStirlingFileStub: vi.fn(),
  bumpRevision: vi.fn(),
  getStirlingFile: vi.fn(),
  updateFileMetadata: vi.fn(async (_id: string, _updates: unknown) => true),
  classify: vi.fn(),
  meter: vi.fn(),
  runPolicyOnFile: vi.fn(),
}));

vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: {}, loading: mocks.configLoading }),
}));
vi.mock("@app/hooks/useClassificationEnabled", () => ({
  useClassificationEnabled: () => true,
}));
vi.mock("@app/hooks/useAiEngineEnabled", () => ({
  useAiEngineEnabled: () => aiEnabled.value,
}));
vi.mock("@app/services/policyDispatch", () => ({
  runPolicyOnFile: (...args: unknown[]) => mocks.runPolicyOnFile(...args),
}));
vi.mock("@app/hooks/usePolicies", () => ({
  usePolicies: () => ({
    policies: {
      classification: {
        configured: true,
        runsOnEditor: true,
        status: "active",
        backendId: "backend-classification",
        runOn: runOn.value,
        sources: ["editor"],
      },
    },
  }),
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ fileStubs: mocks.workspace }),
  useFileManagement: () => ({
    updateStirlingFileStub: mocks.updateStirlingFileStub,
  }),
}));
vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => ({ bumpRevision: mocks.bumpRevision }),
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: (id: string) => mocks.getStirlingFile(id),
    updateFileMetadata: (id: string, updates: unknown) =>
      mocks.updateFileMetadata(id, updates),
  },
}));
vi.mock("@app/services/heuristic/heuristicClassification", () => ({
  classifyFileHeuristically: (file: File) => mocks.classify(file),
}));
vi.mock("@app/services/classificationMeter", () => ({
  meterClassificationRun: (payload: unknown) => mocks.meter(payload),
}));

import { usePolicyLocalPasses } from "@app/components/policies/usePolicyLocalPasses";

// Run idle callbacks immediately so batches start without timer waits.
vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
  cb();
  return 1;
});
vi.stubGlobal("cancelIdleCallback", () => {});

const stub = (id: string, extra: Partial<TestStub> = {}): TestStub => ({
  id,
  name: `${id}.pdf`,
  lastModified: 1,
  ...extra,
});

const fakeFile = (id: string) => new File([id], `${id}.pdf`);

describe("usePolicyLocalPasses delivery", () => {
  beforeEach(() => {
    localStorage.clear();
    resetPolicyRuns();
    mocks.workspace = [];
    mocks.configLoading = false;
    mocks.updateStirlingFileStub.mockClear();
    mocks.bumpRevision.mockClear();
    mocks.updateFileMetadata.mockClear();
    mocks.meter.mockClear();
    mocks.getStirlingFile.mockReset();
    mocks.getStirlingFile.mockImplementation(async (id: string) =>
      fakeFile(id),
    );
    mocks.classify.mockReset();
    aiEnabled.value = false;
    runOn.value = "upload";
    mocks.runPolicyOnFile.mockReset();
    mocks.runPolicyOnFile.mockResolvedValue(undefined);
  });

  it("classifies pending uploads, writes labels, and meters once per file", async () => {
    mocks.workspace = [stub("a"), stub("b")];
    mocks.classify.mockImplementation(async (file: File) => ({
      labels: [file.name.startsWith("a") ? "invoice" : "resume"],
    }));

    renderHook(() => usePolicyLocalPasses());

    await waitFor(() =>
      expect(mocks.updateStirlingFileStub).toHaveBeenCalledTimes(2),
    );
    expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("a", {
      classificationLabels: ["invoice"],
    });
    expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("b", {
      classificationLabels: ["resume"],
    });
    expect(mocks.meter).toHaveBeenCalledTimes(2);
    expect(mocks.bumpRevision).toHaveBeenCalled();
  });

  it("delivers a result computed while the effect re-fired mid-batch (upload-wave race)", async () => {
    let resolveA!: (v: { labels: string[] }) => void;
    const gateA = new Promise<{ labels: string[] }>((r) => (resolveA = r));
    mocks.classify.mockImplementation((file: File) =>
      file.name.startsWith("a") ? gateA : Promise.resolve({ labels: ["nda"] }),
    );
    mocks.workspace = [stub("a")];

    const { rerender } = renderHook(() => usePolicyLocalPasses());
    await waitFor(() => expect(mocks.classify).toHaveBeenCalledTimes(1));

    // A new upload mid-classify re-fires the effect and cancels the in-flight
    // batch; a's already-computed result must still be delivered.
    mocks.workspace = [stub("a"), stub("b")];
    rerender();

    resolveA({ labels: ["purchase-order"] });
    await waitFor(() =>
      expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("a", {
        classificationLabels: ["purchase-order"],
      }),
    );
    // The newly-arrived file classifies too, and neither is double-classified.
    await waitFor(() =>
      expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("b", {
        classificationLabels: ["nda"],
      }),
    );
    expect(mocks.classify).toHaveBeenCalledTimes(2);
    expect(mocks.meter).toHaveBeenCalledTimes(2);
  });

  it("persists a definitive [] verdict for an unlabelled file and does not retry it", async () => {
    mocks.workspace = [stub("plain")];
    mocks.classify.mockResolvedValue({ labels: [] });

    renderHook(() => usePolicyLocalPasses());

    await waitFor(() =>
      expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("plain", {
        classificationLabels: [],
      }),
    );
    expect(mocks.classify).toHaveBeenCalledTimes(1);
    expect(mocks.meter).toHaveBeenCalledTimes(1);
  });

  it("heals a previously-dispatched file whose result was lost, without re-metering", async () => {
    // A past session classified + metered this file but the delivery was lost.
    markDispatched("classification", "lost");
    mocks.workspace = [stub("lost")];
    mocks.classify.mockResolvedValue({ labels: ["bank-statement"] });

    renderHook(() => usePolicyLocalPasses());

    await waitFor(() =>
      expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("lost", {
        classificationLabels: ["bank-statement"],
      }),
    );
    expect(mocks.meter).not.toHaveBeenCalled();
  });

  it("leaves an unreadable file undelivered (no verdict, no meter) so it can retry", async () => {
    // An extraction failure may be environmental, so it must never poison the
    // file with a persisted verdict. The read path deliberately warns.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.workspace = [stub("corrupt")];
    mocks.classify.mockRejectedValue(new Error("bad pdf"));

    renderHook(() => usePolicyLocalPasses());

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("corrupt.pdf: could not be read"),
        expect.any(Error),
      ),
    );
    expect(mocks.classify).toHaveBeenCalledTimes(1); // claimed: once per session
    expect(mocks.updateStirlingFileStub).not.toHaveBeenCalled();
    expect(mocks.updateFileMetadata).not.toHaveBeenCalled();
    expect(mocks.meter).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("waits for app-config before classifying (AI flag unknown = possible double-run)", async () => {
    // While the config loads, aiEnabled reads false even on an AI-on tenant; classifying
    // then would race the server-side classify policy and double-bill the same files.
    mocks.configLoading = true;
    mocks.workspace = [stub("early")];
    mocks.classify.mockResolvedValue({ labels: ["invoice"] });

    const { rerender } = renderHook(() => usePolicyLocalPasses());
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.classify).not.toHaveBeenCalled();

    // Config resolves (AI stays off): the pending file classifies normally.
    mocks.configLoading = false;
    rerender();
    await waitFor(() =>
      expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("early", {
        classificationLabels: ["invoice"],
      }),
    );
  });

  it("skips already-classified files (a real label, or the no-label [] verdict)", async () => {
    mocks.workspace = [
      stub("done", { classificationLabels: ["invoice"] }),
      // [] means classified-nothing-found: it must NOT be re-classified (or re-billed).
      stub("verdict", { classificationLabels: [] }),
    ];

    renderHook(() => usePolicyLocalPasses());

    // Nothing to classify; give the (immediate) idle path a beat to prove it.
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.classify).not.toHaveBeenCalled();
  });

  it("classifies a policy new-file output that has no verdict to inherit", async () => {
    // A new-file policy output is derivedFromTool but carries no label - there is no parent to
    // inherit from. Main classified these through the chain, so the local pass must pick them up.
    mocks.classify.mockResolvedValue({ labels: ["invoice"] });
    mocks.workspace = [stub("newfile", { derivedFromTool: true })];

    renderHook(() => usePolicyLocalPasses());

    await waitFor(() =>
      expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("newfile", {
        classificationLabels: ["invoice"],
      }),
    );
    expect(mocks.meter).toHaveBeenCalledTimes(1);
  });

  it("escalates an unsure local verdict to the AI engine itself", async () => {
    aiEnabled.value = true;
    mocks.workspace = [stub("a")];
    mocks.classify.mockResolvedValue({
      labels: ["invoice"],
      confidence: "low",
    });

    renderHook(() => usePolicyLocalPasses());

    await waitFor(() =>
      expect(mocks.runPolicyOnFile).toHaveBeenCalledWith(
        "classification",
        "backend-classification",
        "a",
        "a.pdf",
      ),
    );
    // The local verdict is still delivered before escalation.
    expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("a", {
      classificationLabels: ["invoice"],
      classificationConfidence: "low",
    });
  });

  it("lets a confident local verdict stand without asking the AI", async () => {
    aiEnabled.value = true;
    mocks.workspace = [stub("a")];
    mocks.classify.mockResolvedValue({
      labels: ["invoice"],
      confidence: "high",
    });

    renderHook(() => usePolicyLocalPasses());

    await waitFor(() =>
      expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("a", {
        classificationLabels: ["invoice"],
        classificationConfidence: "high",
      }),
    );
    expect(mocks.runPolicyOnFile).not.toHaveBeenCalled();
  });

  it("never escalates when the AI engine is off, however unsure the verdict", async () => {
    aiEnabled.value = false;
    mocks.workspace = [stub("a")];
    mocks.classify.mockResolvedValue({
      labels: ["invoice"],
      confidence: "none",
    });

    renderHook(() => usePolicyLocalPasses());

    await waitFor(() =>
      expect(mocks.updateStirlingFileStub).toHaveBeenCalledWith("a", {
        classificationLabels: ["invoice"],
        classificationConfidence: "none",
      }),
    );
    expect(mocks.runPolicyOnFile).not.toHaveBeenCalled();
  });

  it("does not run on upload when the policy is set to run on export", async () => {
    // An export-time policy is enforced by the export path, not this upload engine, so an upload
    // must not classify, meter, or escalate.
    runOn.value = "export";
    aiEnabled.value = true;
    mocks.workspace = [stub("a")];
    mocks.classify.mockResolvedValue({
      labels: ["invoice"],
      confidence: "low",
    });

    renderHook(() => usePolicyLocalPasses());

    // Give the (immediate) idle path a beat to prove it stays silent.
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.classify).not.toHaveBeenCalled();
    expect(mocks.updateStirlingFileStub).not.toHaveBeenCalled();
    expect(mocks.meter).not.toHaveBeenCalled();
    expect(mocks.runPolicyOnFile).not.toHaveBeenCalled();
  });
});
