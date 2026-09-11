import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PoliciesByKey, PolicyState } from "@app/types/policies";
import type { PolicyRunView } from "@app/services/policyPipeline";

// Which policies export-time enforcement picks up: the policy's own editor flag, not its scope.

const loadPolicies = vi.fn<() => PoliciesByKey>();
vi.mock("@app/services/policyStorage", () => ({
  loadPolicies: () => loadPolicies(),
}));

const runStoredPolicy = vi.fn<(id: string, files: File[]) => Promise<string>>();
const getPolicyRun = vi.fn<(id: string) => Promise<PolicyRunView>>();
const downloadPolicyOutput = vi.fn<(id: string) => Promise<Blob>>();
vi.mock("@app/services/policyApi", () => ({
  runStoredPolicy: (id: string, files: File[]) => runStoredPolicy(id, files),
  getPolicyRun: (id: string) => getPolicyRun(id),
  downloadPolicyOutput: (id: string) => downloadPolicyOutput(id),
  resolvePolicyRunTarget: () => "local",
}));

const recordRunStart = vi.fn();
const isDispatched = vi.fn((_policyKey: string, _fileId: string) => false);
vi.mock("@app/components/policies/policyRunStore", () => ({
  recordRunStart: (...args: unknown[]) => recordRunStart(...args),
  isDispatched: (policyKey: string, fileId: string) =>
    isDispatched(policyKey, fileId),
}));
const alert = vi.fn((_options: unknown) => "toast-1");
const updateToast = vi.fn();
vi.mock("@app/components/toast", () => ({
  alert: (options: unknown) => alert(options),
  updateToast: (...args: unknown[]) => updateToast(...args),
  dismissToast: vi.fn(),
}));
vi.mock("@app/i18n", () => ({ default: { t: (key: string) => key } }));

const isFileBlocked = vi.fn((_id: string) => false);
vi.mock("@app/services/policyBlockRegistry", () => ({
  isFileBlocked: (id: string) => isFileBlocked(id),
}));

const { enforceExportPolicies } = await import("@app/services/policyExport");
const { runQueued, subscribeQueue, getQueueJobs } =
  await import("@app/components/policies/enforcementQueue");

function completedRun(runId: string): PolicyRunView {
  return {
    runId,
    policyId: null,
    status: "COMPLETED",
    currentStep: 1,
    stepCount: 1,
    error: null,
    outputs: [{ fileId: `output-${runId}`, fileName: "doc.pdf" }],
    createdAt: 0,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  isFileBlocked.mockReturnValue(false);
  isDispatched.mockReturnValue(false);
  runStoredPolicy.mockImplementation(async (id) => id);
  getPolicyRun.mockImplementation(async (id) => completedRun(id));
  downloadPolicyOutput.mockResolvedValue(
    new Blob(["enforced document"], { type: "application/pdf" }),
  );
});
afterEach(() => vi.useRealTimers());

async function enforce(...args: Parameters<typeof enforceExportPolicies>) {
  const pending = enforceExportPolicies(...args);
  await vi.runAllTimersAsync();
  return pending;
}

/** An active export-time policy as the local store holds it. */
const exportPolicy = (over: Partial<PolicyState>): PolicyState =>
  ({
    configured: true,
    enabled: true,
    backendId: "backend-1",
    sources: [],
    runsOnEditor: false,
    scopeTypes: [],
    reviewerEmail: "",
    fieldValues: {},
    outputMode: "new_version",
    outputName: "",
    runOn: "export",
    isDefault: false,
    ...over,
  }) as PolicyState;

const pdf = () =>
  new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" });

describe("export-time policy selection", () => {
  beforeEach(() => {
    runStoredPolicy.mockClear();
    getPolicyRun.mockClear();
  });

  it("enforces an editor pipeline set to run on export", async () => {
    loadPolicies.mockReturnValue({
      "builder-1": exportPolicy({
        sources: ["editor"],
        runsOnEditor: true,
        backendId: "backend-editor",
      }),
    } as unknown as PoliciesByKey);

    await enforce([pdf()], ["file-1"]);

    expect(runStoredPolicy).toHaveBeenCalledWith(
      "backend-editor",
      expect.any(Array),
    );
  });

  it("leaves a swept pipeline alone, even though its source list is blank", async () => {
    loadPolicies.mockReturnValue({
      "builder-2": exportPolicy({
        sources: [],
        runsOnEditor: false,
        backendId: "backend-swept",
      }),
    } as unknown as PoliciesByKey);

    await enforce([pdf()], ["file-1"]);

    expect(runStoredPolicy).not.toHaveBeenCalled();
  });

  it("still enforces a catalogue tile that nobody has narrowed", async () => {
    loadPolicies.mockReturnValue({
      security: exportPolicy({
        sources: [],
        // A tile is blank because it was never narrowed, so it does run on the editor.
        runsOnEditor: true,
        backendId: "backend-security",
      }),
    } as unknown as PoliciesByKey);

    await enforce([pdf()], ["file-1"]);

    expect(runStoredPolicy).toHaveBeenCalledWith(
      "backend-security",
      expect.any(Array),
    );
  });

  it("enforces in the team's run order, not object order", async () => {
    loadPolicies.mockReturnValue({
      second: exportPolicy({
        runsOnEditor: true,
        backendId: "backend-second",
        order: 1,
      }),
      first: exportPolicy({
        runsOnEditor: true,
        backendId: "backend-first",
        order: 0,
      }),
    } as unknown as PoliciesByKey);

    await enforce([pdf()], ["file-1"]);

    expect(runStoredPolicy.mock.calls.map(([id]) => id)).toEqual([
      "backend-first",
      "backend-second",
    ]);
  });
});

describe("export enforcement on failure", () => {
  beforeEach(() => {
    runStoredPolicy.mockClear();
    getPolicyRun.mockClear();
    getPolicyRun.mockResolvedValue({
      ...completedRun("failed"),
      status: "FAILED",
      outputs: [],
      error: "boom",
    });
  });

  it("blocks the file when a required policy fails", async () => {
    loadPolicies.mockReturnValue({
      "builder-1": exportPolicy({
        runsOnEditor: true,
        backendId: "backend-required",
        required: true,
      }),
    } as unknown as PoliciesByKey);

    const result = await enforce([pdf()], ["file-1"]);

    expect(result.blocked).toEqual(["doc.pdf"]);
    // The blocked file exports nothing enforced: its original input is left in place.
    expect(result.files[0].name).toBe("doc.pdf");
  });

  it("leaves an ordinary pipeline failure soft (exported, not blocked)", async () => {
    loadPolicies.mockReturnValue({
      "builder-1": exportPolicy({
        runsOnEditor: true,
        backendId: "backend-optional",
        required: false,
      }),
    } as unknown as PoliciesByKey);

    const result = await enforce([pdf()], ["file-1"]);

    expect(result.blocked).toEqual([]);
    expect(result.files[0].name).toBe("doc.pdf");
  });
});

describe("export refuses a file blocked at upload", () => {
  beforeEach(() => {
    runStoredPolicy.mockClear();
    isFileBlocked.mockReturnValue(false);
  });

  it("refuses the export without running any export policy", async () => {
    isFileBlocked.mockImplementation((id) => id === "file-1");
    // An export policy is configured, but the upload block short-circuits before it can run.
    loadPolicies.mockReturnValue({
      "builder-1": exportPolicy({ runsOnEditor: true, backendId: "backend-1" }),
    } as unknown as PoliciesByKey);

    const result = await enforce([pdf()], ["file-1"]);

    expect(result.blocked).toEqual(["doc.pdf"]);
    expect(runStoredPolicy).not.toHaveBeenCalled();
  });

  it("refuses even when no export policy is configured", async () => {
    isFileBlocked.mockImplementation((id) => id === "file-1");
    loadPolicies.mockReturnValue({} as unknown as PoliciesByKey);

    const result = await enforce([pdf()], ["file-1"]);

    expect(result.blocked).toEqual(["doc.pdf"]);
  });
});

describe("mixed required and optional export policies", () => {
  it.each(["before", "after"])(
    "keeps required enforcement when an optional pipeline fails %s it",
    async (position) => {
      const order =
        position === "before"
          ? ["optional", "required"]
          : ["required", "optional"];
      loadPolicies.mockReturnValue(
        Object.fromEntries(
          order.map((id, index) => [
            id,
            exportPolicy({
              runsOnEditor: true,
              backendId: id,
              required: id === "required",
              order: index,
            }),
          ]),
        ),
      );
      getPolicyRun.mockImplementation(async (id) => ({
        ...completedRun(id),
        status: id === "optional" ? "FAILED" : "COMPLETED",
      }));
      const original = pdf();
      const result = await enforce([original], ["file-1"]);

      expect(runStoredPolicy.mock.calls.map(([id]) => id)).toEqual(order);
      expect(result.blocked).toEqual([]);
      expect(result.files[0]).not.toBe(original);
      expect(result.files[0].size).toBe(new Blob(["enforced document"]).size);
      expect(recordRunStart).toHaveBeenCalledWith(
        expect.objectContaining({ policyKey: "required", fileId: "file-1" }),
      );
      expect(updateToast).toHaveBeenLastCalledWith(
        "toast-1",
        expect.objectContaining({ alertType: "warning" }),
      );
      if (position === "after") {
        expect(runStoredPolicy.mock.calls[1][1][0]).toBe(result.files[0]);
      }
    },
  );

  it("blocks when the required policy after an optional failure also fails", async () => {
    loadPolicies.mockReturnValue({
      optional: exportPolicy({
        backendId: "optional",
        runsOnEditor: true,
        order: 0,
      }),
      required: exportPolicy({
        backendId: "required",
        required: true,
        runsOnEditor: true,
        order: 1,
      }),
    });
    getPolicyRun.mockImplementation(async (id) => ({
      ...completedRun(id),
      status: "FAILED",
    }));
    const result = await enforce([pdf()], ["file-1"]);
    expect(runStoredPolicy.mock.calls.map(([id]) => id)).toEqual([
      "optional",
      "required",
    ]);
    expect(result.blocked).toEqual(["doc.pdf"]);
    expect(recordRunStart).not.toHaveBeenCalled();
  });
});

describe("blocks appearing during an export", () => {
  beforeEach(() =>
    loadPolicies.mockReturnValue({
      required: exportPolicy({
        backendId: "required",
        runsOnEditor: true,
        required: true,
      }),
    }),
  );

  it.each([false, true])(
    "rechecks when dequeued, including the already-dispatched shortcut (%s)",
    async (alreadyDispatched) => {
      const previous = runQueued(
        { label: "previous export", trigger: "export" },
        () => new Promise<void>((resolve) => setTimeout(resolve, 1000)),
      );
      const pending = enforceExportPolicies([pdf()], ["file-1"]);
      isFileBlocked.mockReturnValue(true);
      isDispatched.mockReturnValue(alreadyDispatched);
      await vi.runAllTimersAsync();
      await previous;
      expect((await pending).blocked).toEqual(["doc.pdf"]);
      expect(runStoredPolicy).not.toHaveBeenCalled();
    },
  );

  it("does not import an enforced version if the source becomes blocked during processing", async () => {
    downloadPolicyOutput.mockImplementation(async () => {
      isFileBlocked.mockReturnValue(true);
      return new Blob(["enforced"]);
    });
    const result = await enforce([pdf()], ["file-1"]);
    expect(result.blocked).toEqual(["doc.pdf"]);
    expect(recordRunStart).not.toHaveBeenCalled();
  });

  it("rechecks every source, including files skipped as already enforced", async () => {
    isDispatched.mockImplementation((_policy, id) => id === "already");
    downloadPolicyOutput.mockImplementation(async () => {
      isFileBlocked.mockImplementation((id) => id === "already");
      return new Blob(["enforced"]);
    });
    const untouched = new File(["%PDF"], "already.pdf", {
      type: "application/pdf",
    });
    const result = await enforce([untouched, pdf()], ["already", "file-1"]);
    expect(result.blocked).toEqual(["already.pdf"]);
    expect(runStoredPolicy).toHaveBeenCalledTimes(1);
  });

  it("rechecks after the queue finishes the job, before returning to its caller", async () => {
    const unsubscribe = subscribeQueue(() => {
      if (getQueueJobs().some((job) => job.status === "done"))
        isFileBlocked.mockReturnValue(true);
    });
    try {
      const result = await enforce([pdf()], ["file-1"]);
      expect(result.blocked).toEqual(["doc.pdf"]);
      expect(alert).toHaveBeenLastCalledWith(
        expect.objectContaining({ alertType: "error" }),
      );
    } finally {
      unsubscribe();
    }
  });
});
