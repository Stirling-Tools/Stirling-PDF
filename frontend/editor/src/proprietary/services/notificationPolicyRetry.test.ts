import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Re-running the policy a notification says failed. The whole point is that nothing was stashed for
 * it: the policy and the document both come off the row, and the bytes come out of storage under the
 * same reference the failure was filed against.
 */

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

// The REAL run store, because the point of registering is that the auto-run controller finds the run
// there and polls it. A mock would assert the call and prove nothing about the record.
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
    // The original reference, not a new one: the server folds a repeat failure onto the same
    // incident rather than opening a second row about the same document.
    expect(runStoredPolicy).toHaveBeenCalledWith("pol-1", [document], "f-1");
  });

  it("records the run so the editor polls it and delivers its output", async () => {
    // Without this the retry is invisible: nothing polls the run, no output reaches the workspace,
    // and the row sits open until the run fails again. usePolicyAutoRun drives all of that off the
    // store, so being in the store IS the progress.
    const document = new File(["%PDF-1.7"], "invoice.pdf");
    getStirlingFile.mockResolvedValue(document);

    await rerunPolicy(target);

    expect(getRun("run-1")).toMatchObject({
      runId: "run-1",
      // The category the backend policy belongs to, which is what the import step needs to honour
      // the policy's output mode and what the chain continues from.
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
    // A policy deleted since, or a cache this browser never built. The run is left to go, since the
    // server-side effect is real and the submission has already happened, but a run with no category
    // cannot be imported or chained, so nothing will ever deliver its output here. The caller is told
    // as much rather than being handed a bare success it would close the failure on.
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
      rechainPolicyOnDocument(target, unlocked, "f-unlocked", false),
    ).resolves.toEqual({
      ok: true,
      tracked: true,
    });
    expect(runStoredPolicy).toHaveBeenCalledWith("pol-1", [unlocked], "f-1");
    // Nothing was read from storage: the unlocked document is not there and never will be.
    expect(getStirlingFile).not.toHaveBeenCalled();
  });

  it("attributes the run to the adopted document, not the one the failure named", async () => {
    // Two references, deliberately: the server gets the failure's, so a repeat folds onto the same
    // incident; the run store gets the adopted one, so the output versions the unlocked document the
    // user is now looking at rather than the encrypted original they still have.
    await rechainPolicyOnDocument(target, unlocked, "f-unlocked", false);

    expect(runStoredPolicy).toHaveBeenCalledWith("pol-1", [unlocked], "f-1");
    expect(getRun("run-1")).toMatchObject({ fileId: "f-unlocked" });
    expect(isDispatched("security", "f-unlocked")).toBe(true);
  });

  it("runs untracked rather than filing the output against the wrong document, and admits it", async () => {
    // No workspace id came back from the adoption. Recording it against the failure's reference
    // would version the encrypted original, which is not what the run produced. So it goes
    // unrecorded, and `tracked` carries that outward: the caller needs it to keep the failure open,
    // since an unpolled run delivers nothing however well the submission went.
    await expect(
      rechainPolicyOnDocument(target, unlocked, null, false),
    ).resolves.toEqual({ ok: true, tracked: false });

    expect(runStoredPolicy).toHaveBeenCalled();
    expect(getRun("run-1")).toBeUndefined();
  });

  it("carries the server's own words when it refuses", async () => {
    runStoredPolicy.mockRejectedValue({
      response: { data: "That policy is no longer enabled." },
    });

    await expect(
      rechainPolicyOnDocument(target, unlocked, "f-unlocked", false),
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
      rechainPolicyOnDocument(target, unlocked, "f-unlocked", false),
    ).resolves.toEqual({
      ok: false,
      reason: "rejected",
      message: "Job queue is full.",
    });
  });

  it("says nothing rather than something unreadable, leaving the wording to the caller", async () => {
    runStoredPolicy.mockRejectedValue(new Error("Network Error"));

    await expect(
      rechainPolicyOnDocument(target, unlocked, "f-unlocked", false),
    ).resolves.toEqual({
      ok: false,
      reason: "rejected",
      message: null,
    });
  });
});

/**
 * Where the chain picks up again. The rule is "the first upload policy not already applied", which is
 * normally the one that failed - the chain only advances on success, so everything ahead of it ran -
 * and is an earlier one only where the chain has changed since.
 */
describe("rechainPolicyOnDocument rejoining the chain", () => {
  const unlocked = new File(["%PDF-1.7"], "invoice.pdf");

  /** An upload policy as the local cache holds it, eligible for the chain. */
  function uploadPolicy(backendId: string, order: number) {
    return {
      backendId,
      configured: true,
      status: "active",
      runOn: "upload",
      sources: ["editor"],
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
    // watermark ran on the upload and produced f-1, which is what security then choked on. Rejoining
    // must not re-apply watermark: the document already carries it, and a second pass would stamp it
    // twice and bill for the privilege.
    policies.value = {
      watermark: uploadPolicy("pol-w", 0),
      security: uploadPolicy("pol-1", 1),
    };
    completedRun("run-w", "watermark", "f-upload", "f-1");

    await rechainPolicyOnDocument(target, unlocked, "f-unlocked", false);

    expect(runStoredPolicy).toHaveBeenCalledWith("pol-1", [unlocked], "f-1");
  });

  it("resumes at an earlier policy that never ran, rather than skipping it", async () => {
    // The chain gained watermark ahead of security after the failing run, so nothing has applied it to
    // this document. Resuming at security would leave it applied to every later upload but not this
    // one, which is the gap this rule exists to close.
    policies.value = {
      watermark: uploadPolicy("pol-w", 0),
      security: uploadPolicy("pol-1", 1),
    };

    await rechainPolicyOnDocument(target, unlocked, "f-unlocked", false);

    // Filed under the resumed policy's own category, so the chaining step carries on from there and
    // security still runs, on watermark's output.
    expect(runStoredPolicy).toHaveBeenCalledWith("pol-w", [unlocked], "f-1");
    expect(getRun("run-1")).toMatchObject({
      categoryId: "watermark",
      fileId: "f-unlocked",
    });
  });

  it("leaves Classification out of the chain while the engine is off", async () => {
    // It classifies in the browser in that build, so the server chain does not include it and it must
    // not become a resume point either.
    policies.value = {
      classification: uploadPolicy("pol-c", 0),
      security: uploadPolicy("pol-1", 1),
    };

    await rechainPolicyOnDocument(target, unlocked, "f-unlocked", false);

    expect(runStoredPolicy).toHaveBeenCalledWith("pol-1", [unlocked], "f-1");
  });

  it("re-runs only what failed when the policy is not in the upload chain at all", async () => {
    // An export-mode policy: there is no upload chain to rejoin, so the retry is the plain re-run it
    // has always been.
    policies.value = {
      watermark: uploadPolicy("pol-w", 0),
      security: { ...uploadPolicy("pol-1", 1), runOn: "export" },
    };

    await rechainPolicyOnDocument(target, unlocked, "f-unlocked", false);

    expect(runStoredPolicy).toHaveBeenCalledWith("pol-1", [unlocked], "f-1");
  });
});
