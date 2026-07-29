import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerNeedsReviewResolver,
  resetReviewGate,
  settleReviewGate,
} from "@app/services/reviewGate";

const writeFile = vi.fn(async () => ({ savedPath: "/tmp/out.pdf" }));
const writeFromUrl = vi.fn(async () => ({ savedPath: "/tmp/out.pdf" }));

vi.mock("@app/services/downloadWriter", () => ({
  writeFile: (...args: unknown[]) => writeFile(...(args as [])),
  writeFromUrl: (...args: unknown[]) => writeFromUrl(...(args as [])),
}));

const { downloadFile, downloadFromUrl } =
  await import("@app/services/downloadService");

describe("downloadService review gate", () => {
  beforeEach(() => {
    resetReviewGate();
    writeFile.mockClear();
    writeFromUrl.mockClear();
  });

  it("writes without asking when nothing needs review", async () => {
    await expect(
      downloadFile({ data: new Blob(["x"]), filename: "a.pdf", fileId: "f1" }),
    ).resolves.toEqual({ savedPath: "/tmp/out.pdf" });
    expect(writeFile).toHaveBeenCalledOnce();
  });

  it("does not write a flagged file the reviewer declines", async () => {
    registerNeedsReviewResolver((ids) => ids);
    const result = downloadFile({
      data: new Blob(["x"]),
      filename: "a.pdf",
      fileId: "f1",
    });
    settleReviewGate(false);
    await expect(result).resolves.toEqual({ cancelled: true });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("gates a URL download on the files it derives from", async () => {
    registerNeedsReviewResolver((ids) => ids);
    const result = downloadFromUrl({
      url: "blob:x",
      filename: "result.pdf",
      fileIds: ["f1", "f2"],
    });
    settleReviewGate(false);
    await expect(result).resolves.toEqual({ cancelled: true });
    expect(writeFromUrl).not.toHaveBeenCalled();
  });

  it("passes through a URL download with no file behind it", async () => {
    registerNeedsReviewResolver((ids) => ids);
    await downloadFromUrl({
      url: "blob:x",
      filename: "extracted.js",
      fileIds: null,
    });
    expect(writeFromUrl).toHaveBeenCalledOnce();
  });
});
