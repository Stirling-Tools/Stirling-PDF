import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { allowConsole, expectConsole } from "@app/tests/failOnConsole";

vi.mock("@app/utils/thumbnailUtils", () => ({
  generateThumbnailForFile: vi.fn(),
  generateThumbnailWithMetadata: vi.fn(),
}));

vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: { autoUnzip: false, autoUnzipFileLimit: 10 },
  }),
}));

vi.mock("@app/services/zipFileService", () => ({
  zipFileService: {
    extractWithPreferences: vi.fn(),
    createZipFromFiles: vi.fn(),
  },
}));

import {
  generateThumbnailForFile,
  generateThumbnailWithMetadata,
} from "@app/utils/thumbnailUtils";
import { useToolResources } from "@app/hooks/tools/shared/useToolResources";

const pdf = (name: string) =>
  new File(["%PDF-1.4"], name, { type: "application/pdf" });

describe("useToolResources thumbnail generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("gives up on a thumbnail that never settles instead of hanging", async () => {
    expectConsole.warn(/Thumbnail generation timed out for stuck\.pdf/);
    vi.useFakeTimers();
    // A wedged pdfium worker never replies, so the promise never settles.
    vi.mocked(generateThumbnailForFile).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useToolResources());
    const pending = result.current.generateThumbnails([pdf("stuck.pdf")]);

    await vi.advanceTimersByTimeAsync(120_000);

    await expect(pending).resolves.toEqual([""]);
  });

  test("gives up on metadata generation that never settles", async () => {
    expectConsole.warn(/Thumbnail generation timed out for stuck\.pdf/);
    vi.useFakeTimers();
    vi.mocked(generateThumbnailWithMetadata).mockReturnValue(
      new Promise(() => {}),
    );

    const { result } = renderHook(() => useToolResources());
    const pending = result.current.generateThumbnailsWithMetadata([
      pdf("stuck.pdf"),
    ]);

    await vi.advanceTimersByTimeAsync(120_000);

    await expect(pending).resolves.toEqual([{ thumbnail: "", pageCount: 1 }]);
  });

  test("one stuck file does not block the rest", async () => {
    expectConsole.warn(/Thumbnail generation timed out for stuck\.pdf/);
    vi.useFakeTimers();
    vi.mocked(generateThumbnailForFile)
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce("data:image/png;base64,ok");

    const { result } = renderHook(() => useToolResources());
    const pending = result.current.generateThumbnails([
      pdf("stuck.pdf"),
      pdf("fine.pdf"),
    ]);

    await vi.advanceTimersByTimeAsync(120_000);

    await expect(pending).resolves.toEqual(["", "data:image/png;base64,ok"]);
  });

  test("still returns real thumbnails when generation succeeds", async () => {
    vi.mocked(generateThumbnailForFile).mockResolvedValue(
      "data:image/png;base64,ok",
    );

    const { result } = renderHook(() => useToolResources());

    await expect(
      result.current.generateThumbnails([pdf("fine.pdf")]),
    ).resolves.toEqual(["data:image/png;base64,ok"]);
  });

  test("a rejected thumbnail still resolves to a placeholder", async () => {
    allowConsole.warn(/Failed to generate thumbnail/);
    vi.mocked(generateThumbnailForFile).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useToolResources());

    await expect(
      result.current.generateThumbnails([pdf("bad.pdf")]),
    ).resolves.toEqual([""]);
  });
});
