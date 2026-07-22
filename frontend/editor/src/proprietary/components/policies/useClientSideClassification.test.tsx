// Delivery guarantees of the client-side classification hook, driving the real
// policyRunStore and mocking only IO (storage, the heuristic engine, the meter).

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
}));

vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: {}, loading: mocks.configLoading }),
}));
vi.mock("@app/hooks/useClassificationEnabled", () => ({
  useClassificationEnabled: () => true,
}));
vi.mock("@app/hooks/useAiEngineEnabled", () => ({
  useAiEngineEnabled: () => false,
}));
vi.mock("@app/hooks/usePolicies", () => ({
  usePolicies: () => ({
    policies: {
      classification: {
        configured: true,
        status: "active",
        backendId: "backend-classification",
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

import { useClientSideClassification } from "@app/components/policies/useClientSideClassification";

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

describe("useClientSideClassification delivery", () => {
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
  });

  it("classifies pending uploads, writes labels, and meters once per file", async () => {
    mocks.workspace = [stub("a"), stub("b")];
    mocks.classify.mockImplementation(async (file: File) => ({
      labels: [file.name.startsWith("a") ? "invoice" : "resume"],
    }));

    renderHook(() => useClientSideClassification());

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

    const { rerender } = renderHook(() => useClientSideClassification());
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

    renderHook(() => useClientSideClassification());

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

    renderHook(() => useClientSideClassification());

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

    renderHook(() => useClientSideClassification());

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

    const { rerender } = renderHook(() => useClientSideClassification());
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

  it("skips tool outputs and already-labelled files", async () => {
    mocks.workspace = [
      stub("derived", { derivedFromTool: true }),
      stub("done", { classificationLabels: ["invoice"] }),
      stub("verdict", { classificationLabels: [] }),
    ];

    renderHook(() => useClientSideClassification());

    // Nothing to classify; give the (immediate) idle path a beat to prove it.
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.classify).not.toHaveBeenCalled();
  });
});
