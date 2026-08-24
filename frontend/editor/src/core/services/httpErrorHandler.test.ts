import { describe, expect, test, vi, beforeEach } from "vitest";
import { handleHttpError } from "@app/services/httpErrorHandler";

const alertMock = vi.hoisted(() => vi.fn());
vi.mock("@app/components/toast", () => ({
  alert: (options: unknown) => alertMock(options),
}));

// Reproduces a tool POST: responseType "blob" makes error.response.data a Blob.
// jsdom's Blob has no .text(), so mirror the browser API the decode path uses.
function blobAxiosError(status: number, body: string, contentType: string) {
  return {
    isAxiosError: true,
    config: { url: "/api/v1/general/merge-pdfs" },
    response: {
      status,
      statusText: "",
      data: { type: contentType, text: () => Promise.resolve(body) },
    },
  };
}

describe("handleHttpError — blob error bodies", () => {
  beforeEach(() => {
    alertMock.mockClear();
  });

  test("shows the decoded server message from a JSON blob body", async () => {
    await handleHttpError(
      blobAxiosError(
        500,
        JSON.stringify({ message: "JPDFium merge failed" }),
        "application/json",
      ),
    );

    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock.mock.calls[0][0]).toMatchObject({
      title: "Server error",
      body: "JPDFium merge failed",
    });
  });

  test("shows the decoded server message from a plain-text blob body", async () => {
    await handleHttpError(
      blobAxiosError(500, "JPDFium merge failed", "text/plain"),
    );

    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(alertMock.mock.calls[0][0]).toMatchObject({
      body: "JPDFium merge failed",
    });
  });
});
