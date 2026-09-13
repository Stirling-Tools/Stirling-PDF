import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PoliciesByKey, PolicyState } from "@app/types/policies";

// Which policies export-time enforcement picks up: the policy's own editor flag, not its scope.

const loadPolicies = vi.fn<() => PoliciesByKey>();
vi.mock("@app/services/policyStorage", () => ({
  loadPolicies: () => loadPolicies(),
}));

const runStoredPolicy = vi.fn(
  async (_id: string, _files: File[], _fileId?: string, _source?: string) =>
    "run-1",
);
vi.mock("@app/services/policyApi", () => ({
  runStoredPolicy: (...args: Parameters<typeof runStoredPolicy>) =>
    runStoredPolicy(...args),
  // One output, so a run completes rather than throwing "produced no output" - which would abort
  // the per-file policy loop after the first policy and hide the order under test.
  getPolicyRun: async () => ({
    status: "COMPLETED",
    outputs: [{ fileId: "out-1", fileName: "doc.pdf" }],
  }),
  downloadPolicyOutput: async () => new Blob(),
  resolvePolicyRunTarget: () => "local",
}));

vi.mock("@app/components/policies/policyRunStore", () => ({
  recordRunStart: vi.fn(),
  isDispatched: () => false,
}));
// Run the queued task inline: the queue's own behaviour is not under test here.
vi.mock("@app/components/policies/enforcementQueue", () => ({
  runQueued: <T>(_meta: unknown, task: () => Promise<T>) => task(),
}));
const { updateToast } = vi.hoisted(() => ({ updateToast: vi.fn() }));
vi.mock("@app/components/toast", () => ({
  alert: () => "toast-1",
  updateToast,
  dismissToast: vi.fn(),
}));
vi.mock("@app/i18n", () => ({ default: { t: (key: string) => key } }));

const { enforceExportPolicies } = await import("@app/services/policyExport");

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
    updateToast.mockClear();
  });

  it("retains the policy failure warning when an automatic export run has insufficient credits", async () => {
    loadPolicies.mockReturnValue({
      security: exportPolicy({ runsOnEditor: true }),
    } as unknown as PoliciesByKey);
    runStoredPolicy.mockRejectedValueOnce({
      response: {
        status: 402,
        data: { error: "ACCOUNT_LINK_REQUIRED", reason: "FREE_TIER_EXHAUSTED" },
      },
    });
    await enforceExportPolicies([pdf()], ["file-1"]);
    expect(runStoredPolicy).toHaveBeenCalledWith(
      "backend-1",
      expect.any(Array),
      undefined,
      "background",
    );
    expect(updateToast).toHaveBeenCalledWith(
      "toast-1",
      expect.objectContaining({
        alertType: "warning",
        title: "policies.enforcement.failureTitle",
      }),
    );
  });

  it("enforces an editor pipeline set to run on export", async () => {
    loadPolicies.mockReturnValue({
      "builder-1": exportPolicy({
        sources: ["editor"],
        runsOnEditor: true,
        backendId: "backend-editor",
      }),
    } as unknown as PoliciesByKey);

    await enforceExportPolicies([pdf()], ["file-1"]);

    expect(runStoredPolicy).toHaveBeenCalledWith(
      "backend-editor",
      expect.any(Array),
      undefined,
      "background",
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

    await enforceExportPolicies([pdf()], ["file-1"]);

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

    await enforceExportPolicies([pdf()], ["file-1"]);

    expect(runStoredPolicy).toHaveBeenCalledWith(
      "backend-security",
      expect.any(Array),
      undefined,
      "background",
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

    await enforceExportPolicies([pdf()], ["file-1"]);

    expect(runStoredPolicy.mock.calls.map(([id]) => id)).toEqual([
      "backend-first",
      "backend-second",
    ]);
  });
});
