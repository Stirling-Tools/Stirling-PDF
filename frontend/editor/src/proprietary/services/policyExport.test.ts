import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PoliciesByKey, PolicyState } from "@app/types/policies";

// Which policies export-time enforcement picks up: the policy's own editor flag, not its scope.

const loadPolicies = vi.fn<() => PoliciesByKey>();
vi.mock("@app/services/policyStorage", () => ({
  loadPolicies: () => loadPolicies(),
}));

const runStoredPolicy = vi.fn(async (_id: string, _files: File[]) => "run-1");
const output = { name: "doc.pdf", type: "application/pdf" };
vi.mock("@app/services/policyApi", () => ({
  runStoredPolicy: (id: string, files: File[]) => runStoredPolicy(id, files),
  // One output, so a run completes rather than throwing "produced no output" - which would abort
  // the per-file policy loop after the first policy and hide the order under test.
  getPolicyRun: async () => ({
    status: "COMPLETED",
    outputs: [{ fileId: "out-1", fileName: output.name }],
  }),
  downloadPolicyOutput: async () => new Blob([], { type: output.type }),
  resolvePolicyRunTarget: () => "local",
}));

vi.mock("@app/components/policies/policyRunStore", () => ({
  recordRunStart: vi.fn(),
  isDispatched: () => false,
  getPolicyRunOutcomes: () => ({}),
}));
// Run the queued task inline: the queue's own behaviour is not under test here.
vi.mock("@app/components/policies/enforcementQueue", () => ({
  runQueued: <T>(_meta: unknown, task: () => Promise<T>) => task(),
}));
vi.mock("@app/components/toast", () => ({
  alert: () => "toast-1",
  updateToast: vi.fn(),
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
    firstOperation: "/api/v1/misc/compress-pdf",
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
    vi.useFakeTimers();
    runStoredPolicy.mockClear();
    output.name = "doc.pdf";
    output.type = "application/pdf";
  });
  afterEach(() => vi.useRealTimers());

  it("selects each pipeline by its first input and rechecks converted outputs", async () => {
    const image = new File(["image"], "scan.PNG", { type: "image/png" });
    const word = new File(["word"], "letter.docx");
    loadPolicies.mockReturnValue({
      image: exportPolicy({
        runsOnEditor: true,
        backendId: "image",
        order: 0,
        firstOperation: "/api/v1/convert/img/pdf",
      }),
      pdf: exportPolicy({
        runsOnEditor: true,
        backendId: "pdf",
        order: 1,
      }),
      laterImage: exportPolicy({
        runsOnEditor: true,
        backendId: "later-image",
        order: 2,
        firstOperation: "/api/v1/convert/img/pdf",
      }),
    });
    output.type = "";

    const enforcement = enforceExportPolicies([pdf(), image, word]);
    await vi.runAllTimersAsync();
    const result = await enforcement;

    expect(runStoredPolicy.mock.calls.map(([id]) => id)).toEqual([
      "pdf",
      "image",
      "pdf",
    ]);
    expect(runStoredPolicy.mock.calls[1][1]).toEqual([image]);
    expect(runStoredPolicy.mock.calls[2][1][0].name).toBe("doc.pdf");
    expect(result.map((file) => file.name)).toEqual([
      "doc.pdf",
      "scan.pdf",
      "letter.docx",
    ]);
    expect(result[2]).toBe(word);
  });

  it("passes incompatible files through without dispatching", async () => {
    loadPolicies.mockReturnValue({
      image: exportPolicy({
        runsOnEditor: true,
        firstOperation: "/api/v1/convert/img/pdf",
      }),
    });
    const files = [pdf(), new File(["word"], "letter.docx")];

    expect(await enforceExportPolicies(files)).toBe(files);
    expect(runStoredPolicy).not.toHaveBeenCalled();
  });

  it("refuses export when a required policy fails", async () => {
    loadPolicies.mockReturnValue({
      security: exportPolicy({ runsOnEditor: true, required: true }),
    });
    runStoredPolicy.mockRejectedValueOnce(new Error("offline"));
    await expect(enforceExportPolicies([pdf()], ["file-1"])).rejects.toThrow(
      "policy.exportBlocked",
    );
  });

  it("still enforces a later required policy after an optional failure", async () => {
    loadPolicies.mockReturnValue({
      optional: exportPolicy({
        runsOnEditor: true,
        backendId: "optional",
        order: 0,
      }),
      required: exportPolicy({
        runsOnEditor: true,
        backendId: "required",
        required: true,
        order: 1,
      }),
    });
    runStoredPolicy.mockRejectedValueOnce(new Error("offline"));
    const enforcement = enforceExportPolicies([pdf()], ["file-1"]);
    await vi.runAllTimersAsync();
    await enforcement;
    expect(runStoredPolicy.mock.calls.map(([id]) => id)).toEqual([
      "optional",
      "required",
    ]);
  });

  it("still allows the original when an ordinary pipeline fails", async () => {
    loadPolicies.mockReturnValue({
      security: exportPolicy({ runsOnEditor: true, required: false }),
    });
    runStoredPolicy.mockRejectedValueOnce(new Error("offline"));
    const input = pdf();
    await expect(enforceExportPolicies([input], ["file-1"])).resolves.toEqual([
      input,
    ]);
  });

  it("enforces an editor pipeline set to run on export", async () => {
    loadPolicies.mockReturnValue({
      "builder-1": exportPolicy({
        sources: ["editor"],
        runsOnEditor: true,
        backendId: "backend-editor",
      }),
    } as unknown as PoliciesByKey);

    const enforcement = enforceExportPolicies([pdf()], ["file-1"]);
    await vi.runAllTimersAsync();
    await enforcement;

    expect(runStoredPolicy).toHaveBeenCalledWith(
      "backend-editor",
      expect.anything(),
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

    const enforcement = enforceExportPolicies([pdf()], ["file-1"]);
    await vi.runAllTimersAsync();
    await enforcement;

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

    const enforcement = enforceExportPolicies([pdf()], ["file-1"]);
    await vi.runAllTimersAsync();
    await enforcement;

    expect(runStoredPolicy).toHaveBeenCalledWith(
      "backend-security",
      expect.anything(),
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

    const enforcement = enforceExportPolicies([pdf()], ["file-1"]);
    await vi.runAllTimersAsync();
    await enforcement;

    expect(runStoredPolicy.mock.calls.map(([id]) => id)).toEqual([
      "backend-first",
      "backend-second",
    ]);
  });
});
