import { beforeEach, describe, expect, it, vi } from "vitest";

// Nothing was stashed: the policy, the document and the bytes all come off the row's reference.

const getStirlingFile = vi.fn();
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFile: (...args: unknown[]) => getStirlingFile(...args),
  },
}));

const runStoredPolicy = vi.fn();
vi.mock("@app/services/policyApi", () => ({
  runStoredPolicy: (...args: unknown[]) => runStoredPolicy(...args),
  resolvePolicyRunTarget: () => "saas",
}));

/** The local policy cache, which is how a backend policy id becomes a category without any hook. */
const policies = vi.hoisted(() => ({
  value: { security: { backendId: "pol-1" } } as Record<
    string,
    {
      backendId?: string;
      // The rest of what the chain order is built from, so a test can make a policy eligible for it.
      configured?: boolean;
      status?: string;
      runOn?: string;
      sources?: string[];
      order?: number;
    }
  >,
}));
vi.mock("@app/services/policyStorage", () => ({
  loadPolicies: () => policies.value,
}));

// The REAL run store: a mock would assert the call and prove nothing about the record.
const { getRun, isDispatched, recordRunStart, resetPolicyRuns, updateRun } =
  await import("@app/components/policies/policyRunStore");
const { rerunPolicy, rechainPolicyOnDocument } =
  await import("@app/services/notificationPolicyRetry");

const target = { policyId: "pol-1", fileId: "f-1" };

beforeEach(() => {
  getStirlingFile.mockReset().mockResolvedValue(null);
  runStoredPolicy.mockReset().mockResolvedValue("run-1");
  policies.value = { security: { backendId: "pol-1" } };
  localStorage.clear();
  resetPolicyRuns();
});

describe("rerunPolicy", () => {
  it("submits the stored document under the reference the failure named", async () => {
    const document = new File(["%PDF-1.7"], "invoice.pdf", {
      type: "application/pdf",
    });
    getStirlingFile.mockResolvedValue(document);

    await expect(rerunPolicy(target)).resolves.toEqual({
      ok: true,
      tracked: true,
    });
    // The original reference, so the server folds a repeat onto the same incident.
    expect(runStoredPolicy).toHaveBeenCalledWith("pol-1", [document], "f-1");
  });

  it("records the run so the editor polls it and delivers its output", async () => {
    // usePolicyAutoRun drives everything off the store, so being in the store IS the progress.
    const document = new File(["%PDF-1.7"], "invoice.pdf");
    getStirlingFile.mockResolvedValue(document);

    await rerunPolicy(target);

    expect(getRun("run-1")).toMatchObject({
      runId: "run-1",
      // The category the import step needs, and what the chain continues from.
      categoryId: "security",
      // The document that failed is still the document in the workspace, so the output belongs to it.
      fileId: "f-1",
      fileName: "invoice.pdf",
      status: "PENDING",
      target: "saas",
    });
    // Marked dispatched as any other run is, so the pair is not treated as never having run.
    expect(isDispatched("security", "f-1")).toBe(true);
  });

  it("still runs a policy the local cache cannot place, and says the run is untracked", async () => {
    // A run with no category cannot be imported or chained, so nothing delivers its output.
    policies.value = {};
    getStirlingFile.mockResolvedValue(new File(["%PDF-1.7"], "invoice.pdf"));

    await expect(rerunPolicy(target)).resolves.toEqual({
      ok: true,
      tracked: false,
    });
    expect(runStoredPolicy).toHaveBeenCalled();
    expect(getRun("run-1")).toBeUndefined();
  });

  it("records nothing when the run was refused, so no phantom sits in the feed", async () => {
    getStirlingFile.mockResolvedValue(new File(["%PDF-1.7"], "invoice.pdf"));
    runStoredPolicy.mockRejectedValue(new Error("refused"));

    await rerunPolicy(target);

    expect(getRun("run-1")).toBeUndefined();
  });

  it("reports the document is gone rather than submitting nothing", async () => {
    getStirlingFile.mockResolvedValue(null);

    await expect(rerunPolicy(target)).resolves.toEqual({
      ok: false,
      reason: "missingFile",
    });
    expect(runStoredPolicy).not.toHaveBeenCalled();
  });

  it("treats a browser that will not answer for the file as not having it", async () => {
    // Same outcome for the reader either way, and an exception here is not theirs to see.
    getStirlingFile.mockRejectedValue(new Error("storage unavailable"));

    await expect(rerunPolicy(target)).resolves.toEqual({
      ok: false,
      reason: "missingFile",
    });
  });
});

describe("rechainPolicyOnDocument", () => {
  const unlocked = new File(["%PDF-1.7"], "invoice.pdf");

  it("submits bytes the caller already holds, still under the original reference", async () => {
    await expect(
      rechainPolicyOnDocument(target, unlocked, "f-unlocked"),
    ).resolves.toEqual({
      ok: true,
      tracked: true,
    });
    expect(runStoredPolicy).toHaveBeenCalledWith("pol-1", [unlocked], "f-1");
    // Nothing was read from storage: the unlocked document is not there and never will be.
    expect(getStirlingFile).not.toHaveBeenCalled();
  });

  it("attributes the run to the adopted document, not the one the failure named", async () => {
    // Two references: the failure's to the server so a repeat folds on, the adopted one to the store.
    await rechainPolicyOnDocument(target, unlocked, "f-unlocked");

    expect(runStoredPolicy).toHaveBeenCalledWith("pol-1", [unlocked], "f-1");
    expect(getRun("run-1")).toMatchObject({ fileId: "f-unlocked" });
    expect(isDispatched("security", "f-unlocked")).toBe(true);
  });

  it("runs untracked rather than filing the output against the wrong document, and admits it", async () => {
    // No workspace id, so recording it would version the encrypted original instead.
    await expect(
      rechainPolicyOnDocument(target, unlocked, null),
    ).resolves.toEqual({ ok: true, tracked: false });

    expect(runStoredPolicy).toHaveBeenCalled();
    expect(getRun("run-1")).toBeUndefined();
  });

  it("carries the server's own words when it refuses", async () => {
    runStoredPolicy.mockRejectedValue({
      response: { data: "That policy is no longer enabled." },
    });

    await expect(
      rechainPolicyOnDocument(target, unlocked, "f-unlocked"),
    ).resolves.toEqual({
      ok: false,
      reason: "rejected",
      message: "That policy is no longer enabled.",
    });
  });

  it("reads the message out of a structured error body too", async () => {
    runStoredPolicy.mockRejectedValue({
      response: { data: { message: "Job queue is full." } },
    });

    await expect(
      rechainPolicyOnDocument(target, unlocked, "f-unlocked"),
    ).resolves.toEqual({
      ok: false,
      reason: "rejected",
      message: "Job queue is full.",
    });
  });

  it("says nothing rather than something unreadable, leaving the wording to the caller", async () => {
    runStoredPolicy.mockRejectedValue(new Error("Network Error"));

    await expect(
      rechainPolicyOnDocument(target, unlocked, "f-unlocked"),
    ).resolves.toEqual({
      ok: false,
      reason: "rejected",
      message: null,
    });
  });
});

// Where the chain picks up again: the first upload policy not already applied.
describe("rechainPolicyOnDocument rejoining the chain", () => {
  const unlocked = new File(["%PDF-1.7"], "invoice.pdf");

  /** An upload policy as the local cache holds it, eligible for the chain. */
  function uploadPolicy(backendId: string, order: number) {
    return {
      backendId,
      configured: true,
      status: "active",
      runOn: "upload",
      sources: [],
      runsOnEditor: true,
      order,
    };
  }

  /** A completed run of `categoryId` that turned `fileId` into `outputFileId`. */
  function completedRun(
    runId: string,
    categoryId: string,
    fileId: string,
    outputFileId: string,
  ) {
    recordRunStart({
      runId,
      categoryId,
      fileId,
      fileName: "invoice.pdf",
      fileSize: 1,
      target: "saas",
      status: "PENDING",
      outputs: [],
      error: null,
      startedAt: 1,
    });
    updateRun(runId, {
      status: "COMPLETED",
      imported: true,
      outputFileIds: [outputFileId],
    });
  }

  it("resumes at the policy that failed when everything ahead of it has run", async () => {
    // watermark produced f-1, so rejoining must not stamp it twice and bill for the privilege.
    policies.value = {
      watermark: uploadPolicy("pol-w", 0),
      security: uploadPolicy("pol-1", 1),
    };
    completedRun("run-w", "watermark", "f-upload", "f-1");

    await rechainPolicyOnDocument(target, unlocked, "f-unlocked");

    expect(runStoredPolicy).toHaveBeenCalledWith("pol-1", [unlocked], "f-1");
  });

  it("resumes at an earlier policy that never ran, rather than skipping it", async () => {
    // The chain gained watermark after the failing run, so nothing has applied it to this document.
    policies.value = {
      watermark: uploadPolicy("pol-w", 0),
      security: uploadPolicy("pol-1", 1),
    };

    await rechainPolicyOnDocument(target, unlocked, "f-unlocked");

    // Filed under the resumed policy's category, so security still runs on watermark's output.
    expect(runStoredPolicy).toHaveBeenCalledWith("pol-w", [unlocked], "f-1");
    expect(getRun("run-1")).toMatchObject({
      categoryId: "watermark",
      fileId: "f-unlocked",
    });
  });

  it("leaves Classification out of the chain while the engine is off", async () => {
    // It classifies in the browser there, so it is not in the server chain nor a resume point.
    policies.value = {
      classification: uploadPolicy("pol-c", 0),
      security: uploadPolicy("pol-1", 1),
    };

    await rechainPolicyOnDocument(target, unlocked, "f-unlocked");

    expect(runStoredPolicy).toHaveBeenCalledWith("pol-1", [unlocked], "f-1");
  });

  it("re-runs only what failed when the policy is not in the upload chain at all", async () => {
    // An export-mode policy has no upload chain to rejoin, so the retry is a plain re-run.
    policies.value = {
      watermark: uploadPolicy("pol-w", 0),
      security: { ...uploadPolicy("pol-1", 1), runOn: "export" },
    };

    await rechainPolicyOnDocument(target, unlocked, "f-unlocked");

    expect(runStoredPolicy).toHaveBeenCalledWith("pol-1", [unlocked], "f-1");
  });
});
