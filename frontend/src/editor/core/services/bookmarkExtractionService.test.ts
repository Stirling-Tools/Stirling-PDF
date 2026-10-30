import { beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "@editor/services/apiClient";
import { extractBookmarks } from "@editor/services/bookmarkExtractionService";

vi.mock("@editor/services/apiClient", () => ({
  default: { post: vi.fn() },
}));

const post = vi.mocked(apiClient.post);

describe("bookmark extraction", () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ data: [] });
  });

  it("sends a stored reference instead of the PDF bytes", async () => {
    await extractBookmarks(
      new File(["%PDF-1.7"], "doc.pdf", { type: "application/pdf" }),
      "storage:42",
    );

    const body = post.mock.calls[0][1] as FormData;
    expect(body.get("fileId")).toBe("storage:42");
    expect(body.get("fileInput")).toBeNull();
  });

  it("uploads when no stored reference is available", async () => {
    await extractBookmarks(
      new File(["%PDF-1.7"], "doc.pdf", { type: "application/pdf" }),
    );

    const body = post.mock.calls[0][1] as FormData;
    expect(body.get("fileId")).toBeNull();
    expect(body.get("fileInput")).toBeInstanceOf(File);
  });
});
