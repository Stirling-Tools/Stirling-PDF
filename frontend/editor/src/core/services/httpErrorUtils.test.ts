import { describe, expect, it } from "vitest";
import { extractAxiosErrorMessage } from "@app/services/httpErrorUtils";

describe("problem detail selection", () => {
  it.each([
    "",
    "Request failed",
    "500 Server Error",
    undefined,
    { unexpected: true },
  ])("uses a specific detail when message is %j", (message) => {
    const result = extractAxiosErrorMessage({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message, detail: "pageNumbers selects no pages" },
      },
    });
    expect(result.body).toBe("pageNumbers selects no pages");
  });

  it("preserves a specific message", () => {
    expect(
      extractAxiosErrorMessage({
        isAxiosError: true,
        response: {
          status: 400,
          data: { message: "Unsupported image", detail: "Generic detail" },
        },
      }).body,
    ).toBe("Unsupported image");
  });
});
