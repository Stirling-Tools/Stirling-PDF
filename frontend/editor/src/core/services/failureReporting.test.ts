import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the editor's failure reporter. Two properties matter: it never sends a
 * document name, and it never lets its own failure reach the tool the user was
 * running.
 */

const post = vi.fn();

/**
 * Indirection so one test can replace the transport with a plain throwing closure.
 * A vi.fn that throws has its error re-reported by vitest even once the code under
 * test has caught it, which would fail the very test asserting it was caught.
 */
let transport: (...args: unknown[]) => unknown = (...args) => post(...args);

vi.mock("@app/services/apiClient", () => ({
  default: { post: (...args: unknown[]) => transport(...args) },
}));

const { reportToolFailure, errorCodeOf } =
  await import("@app/services/failureReporting");

/** An axios-shaped rejection carrying a Problem Details body. */
function problemDetail(errorCode: string, extra: Record<string, unknown> = {}) {
  return {
    response: {
      status: 400,
      data: { type: "/errors/pdf-password", errorCode, ...extra },
    },
    message: "Request failed with status code 400",
  };
}

describe("errorCodeOf", () => {
  it("reads the code out of a Problem Details body", async () => {
    await expect(errorCodeOf(problemDetail("E004"))).resolves.toBe("E004");
  });

  it("reads the code out of a blob body, which is how a download-typed call fails", async () => {
    const error = {
      response: {
        data: {
          text: () => Promise.resolve(JSON.stringify({ errorCode: "E001" })),
        },
      },
    };

    await expect(errorCodeOf(error)).resolves.toBe("E001");
  });

  it("returns null when the body carries no code", async () => {
    await expect(
      errorCodeOf({ response: { data: { title: "nope" } } }),
    ).resolves.toBeNull();
    await expect(errorCodeOf({ message: "network error" })).resolves.toBeNull();
    await expect(errorCodeOf(undefined)).resolves.toBeNull();
  });

  it("returns null rather than throwing on an unparseable blob", async () => {
    const error = {
      response: { data: { text: () => Promise.resolve("<html>502</html>") } },
    };

    await expect(errorCodeOf(error)).resolves.toBeNull();
  });
});

describe("reportToolFailure", () => {
  beforeEach(() => {
    post.mockReset().mockResolvedValue({ status: 204 });
    transport = (...args) => post(...args);
  });

  it("posts the operation, code and file ids", async () => {
    await reportToolFailure({
      operation: "remove-password",
      error: problemDetail("E004"),
      fileIds: ["f-1", "f-2"],
    });

    expect(post).toHaveBeenCalledTimes(1);
    const [path, body] = post.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(path).toBe("/api/v1/file-run-events/reports");
    expect(body).toMatchObject({
      operation: "remove-password",
      errorCode: "E004",
      fileIds: ["f-1", "f-2"],
    });
  });

  it("ignores names a caller hands it, and identifies files by id", async () => {
    // fileNames is accepted and dropped on purpose, so a call site holding names cannot pass
    // them somewhere they would be stored as a document reference.
    await reportToolFailure({
      operation: "compress",
      error: { response: { status: 500, data: {} }, message: "boom" },
      fileIds: ["f-1"],
      fileNames: ["Q4 report.pdf"],
    });

    const body = post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.fileIds).toEqual(["f-1"]);
    expect(JSON.stringify(body)).not.toContain("Q4 report.pdf");
  });

  it("sends the message the user saw, unaltered", async () => {
    // Their own error about their own file: trimming it only makes the row harder to act on.
    await reportToolFailure({
      operation: "compress",
      error: {
        response: { status: 500, data: {} },
        message: "Failed on Q4 report.pdf",
      },
      fileIds: ["f-1"],
    });

    expect((post.mock.calls[0]?.[1] as { detail: string }).detail).toBe(
      "Failed on Q4 report.pdf",
    );
  });

  it("sends no team, because the server derives it", async () => {
    await reportToolFailure({
      operation: "compress",
      error: problemDetail("E004"),
      fileIds: ["f-1"],
    });

    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toMatch(/team/i);
  });

  it("swallows its own failure so the tool's own error handling is unaffected", async () => {
    transport = () => {
      throw new Error("404 - no such route on a core build");
    };

    let threw = false;
    try {
      await reportToolFailure({
        operation: "compress",
        error: problemDetail("E004"),
        fileIds: ["f-1"],
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });

  it("reports a client-side refusal, which is a failure a leader can act on", async () => {
    // The same class of problem as the processor rejecting a file type, which is
    // already recorded. Unclassified, so the server files it as UNKNOWN.
    await reportToolFailure({
      operation: "convert",
      error: new Error("Unsupported conversion format"),
      fileIds: ["f-1"],
    });

    const body = post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).toMatchObject({
      operation: "convert",
      errorCode: null,
      detail: "Unsupported conversion format",
    });
  });

  it("reports a network failure, which got no reply but did leave the browser", async () => {
    await reportToolFailure({
      operation: "compress",
      error: { request: {}, message: "Network Error" },
      fileIds: ["f-1"],
    });

    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an axios cancellation", { code: "ERR_CANCELED", message: "canceled" }],
    [
      "the rethrown wrapper useToolApiCalls builds",
      new Error("Operation was cancelled", {
        cause: { code: "ERR_CANCELED" },
      }),
    ],
  ])("ignores %s, because the user chose to stop", async (_label, error) => {
    await reportToolFailure({ operation: "compress", error, fileIds: ["f-1"] });

    expect(post).not.toHaveBeenCalled();
  });

  it("does nothing without an operation to attribute the failure to", async () => {
    await reportToolFailure({
      operation: "",
      error: { response: { status: 500 } },
      fileIds: ["f-1"],
    });

    expect(post).not.toHaveBeenCalled();
  });

  it("sends every file id, since trimming would lose failures silently", async () => {
    const many = Array.from({ length: 60 }, (_, i) => `f-${i}`);

    await reportToolFailure({
      operation: "compress",
      error: problemDetail("E004"),
      fileIds: many,
    });

    const body = post.mock.calls[0]?.[1] as { fileIds: string[] };
    expect(body.fileIds).toEqual(many);
  });
});
