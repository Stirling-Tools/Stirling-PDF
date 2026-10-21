import { describe, expect, it } from "vitest";
import { serverErrorReason } from "@app/services/errorUtils";

const blobError = (body: object) => ({
  response: {
    data: new Blob([JSON.stringify(body)], { type: "application/json" }),
  },
});

describe("serverErrorReason", () => {
  it("reads a problem detail from a blob body", async () => {
    await expect(
      serverErrorReason(
        blobError({
          detail: "Invalid page selection '0': pages are numbered 1 to 3.",
        }),
      ),
    ).resolves.toBe("Invalid page selection '0': pages are numbered 1 to 3.");
  });

  it("falls back to message and ignores unreadable bodies", async () => {
    await expect(
      serverErrorReason(blobError({ message: "No pages" })),
    ).resolves.toBe("No pages");
    await expect(
      serverErrorReason(new Error("network")),
    ).resolves.toBeUndefined();
  });
});
