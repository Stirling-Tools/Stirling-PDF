import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "@editor/services/apiClient";
import {
  chunkSizeFor,
  uploadTemporaryFileInChunks,
} from "@editor/services/chunkedUploadService";

vi.mock("@editor/services/apiClient", () => ({
  default: {
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const post = vi.mocked(apiClient.post);
const put = vi.mocked(apiClient.put);
const remove = vi.mocked(apiClient.delete);

function bigFile(size: number): File {
  return new File([new Uint8Array(size)], "big.pdf", {
    type: "application/pdf",
  });
}

describe("chunked upload", () => {
  beforeEach(() => {
    post.mockReset();
    put.mockReset();
    remove.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uploads chunks in parallel and completes the session", async () => {
    post
      .mockResolvedValueOnce({
        data: {
          uploadId: "upload-1",
          chunkSize: 4 * 1024 * 1024,
          totalChunks: 3,
        },
      })
      .mockResolvedValueOnce({ data: { id: 7 } });
    put.mockResolvedValue({});

    const file = bigFile(9 * 1024 * 1024);
    await expect(uploadTemporaryFileInChunks(file)).resolves.toBe(7);

    expect(post).toHaveBeenNthCalledWith(
      1,
      "/api/v1/storage/uploads",
      expect.objectContaining({
        sizeBytes: file.size,
        chunkSize: 512 * 1024,
      }),
    );
    expect(put).toHaveBeenCalledTimes(3);
    const urls = put.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.endsWith("/chunks/0"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/chunks/1"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/chunks/2"))).toBe(true);
    expect(post).toHaveBeenLastCalledWith(
      "/api/v1/storage/uploads/upload-1/complete",
    );
  });

  it("balances chunks across connections as files grow", () => {
    expect(chunkSizeFor(2 * 1024 * 1024)).toBe(256 * 1024);
    expect(chunkSizeFor(9 * 1024 * 1024)).toBe(512 * 1024);
    expect(chunkSizeFor(20 * 1024 * 1024)).toBe(512 * 1024);
    expect(chunkSizeFor(100 * 1024 * 1024)).toBe(512 * 1024);
    expect(chunkSizeFor(10 * 1024 * 1024 * 1024)).toBe(4 * 1024 * 1024);
  });

  it("skips the chunked path for small files", async () => {
    await expect(
      uploadTemporaryFileInChunks(new File(["small"], "small.pdf")),
    ).resolves.toBeUndefined();
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("retries a transient chunk failure", async () => {
    vi.useFakeTimers();
    post
      .mockResolvedValueOnce({
        data: {
          uploadId: "upload-1",
          chunkSize: 4 * 1024 * 1024,
          totalChunks: 3,
        },
      })
      .mockResolvedValueOnce({ data: { id: 7 } });
    put.mockRejectedValueOnce(new Error("network")).mockResolvedValue({});

    const promise = uploadTemporaryFileInChunks(bigFile(9 * 1024 * 1024));
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe(7);
    expect(put).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it("cancels and returns undefined when a chunk keeps failing", async () => {
    vi.useFakeTimers();
    post.mockResolvedValueOnce({
      data: {
        uploadId: "upload-2",
        chunkSize: 4 * 1024 * 1024,
        totalChunks: 3,
      },
    });
    put.mockRejectedValue(new Error("network"));

    const promise = uploadTemporaryFileInChunks(bigFile(9 * 1024 * 1024));
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith("/api/v1/storage/uploads/upload-2");
    vi.useRealTimers();
  });
});
