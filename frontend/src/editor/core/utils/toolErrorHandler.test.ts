import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { resolveToolErrorMessage } from "@editor/utils/toolErrorHandler";

const problem = { title: "Invalid Argument", detail: "Pages must be 1 to 3." };

function httpError(data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError(
    "Request failed with status code 400",
    "ERR_BAD_REQUEST",
    config,
    undefined,
    { data, status: 400, statusText: "", headers: {}, config },
  );
}

describe("resolveToolErrorMessage", () => {
  it("shows the server's reason instead of the axios status text", async () => {
    const blob = new Blob([JSON.stringify(problem)], {
      type: "application/json",
    });
    await expect(resolveToolErrorMessage(httpError(blob))).resolves.toBe(
      "Pages must be 1 to 3.",
    );
  });

  it("shows the server's reason instead of a raw JSON body", async () => {
    await expect(
      resolveToolErrorMessage(httpError(JSON.stringify(problem))),
    ).resolves.toBe("Pages must be 1 to 3.");
  });

  it("keeps a plain-text body, which is already the reason", async () => {
    await expect(
      resolveToolErrorMessage(httpError("File is encrypted")),
    ).resolves.toBe("File is encrypted");
  });

  it("shows the status text instead of an HTML error page", async () => {
    await expect(
      resolveToolErrorMessage(
        httpError("<html><body><h1>502 Bad Gateway</h1></body></html>"),
      ),
    ).resolves.toBe("Request failed with status code 400");
  });

  it("keeps the status text when the server gave no reason", async () => {
    await expect(resolveToolErrorMessage(httpError(null))).resolves.toBe(
      "Request failed with status code 400",
    );
  });

  it("keeps a tool's own message", async () => {
    await expect(
      resolveToolErrorMessage(
        httpError(JSON.stringify(problem)),
        () => "Wrong password",
      ),
    ).resolves.toBe("Wrong password");
  });
});
