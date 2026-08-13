import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the run request puts on the wire. Only the document reference is pinned, because it is the one
 * field with a rule attached: the server records it against any failure of the run, so a filename here
 * would put a document name into a table that deliberately has nowhere to keep one.
 */

const post = vi.fn().mockResolvedValue({ data: { jobId: "run-1" } });

vi.mock("@app/services/apiClient", () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}));

const { runStoredPolicy } = await import("@app/services/policyApi");

/** The multipart body the last call sent. */
function sentForm(): FormData {
  return post.mock.calls.at(-1)?.[1] as FormData;
}

const document = () =>
  new File(["%PDF-1.7"], "quarterly-report.pdf", { type: "application/pdf" });

describe("runStoredPolicy", () => {
  beforeEach(() => {
    post.mockClear();
  });

  it("sends the workspace id of the document it is running on", async () => {
    await runStoredPolicy("policy-1", [document()], "editor-file-1");

    expect(post.mock.calls.at(-1)?.[0]).toBe("/api/v1/policies/policy-1/run");
    expect(sentForm().get("fileId")).toBe("editor-file-1");
  });

  it("sends no reference when the caller has none", async () => {
    // The export path can enforce on bytes with no workspace document behind them.
    await runStoredPolicy("policy-1", [document()]);

    expect(sentForm().has("fileId")).toBe(false);
  });

  it("never sends the document's name as the reference", async () => {
    await runStoredPolicy("policy-1", [document()], "editor-file-1");

    expect(sentForm().get("fileId")).not.toContain("quarterly-report");
  });
});
