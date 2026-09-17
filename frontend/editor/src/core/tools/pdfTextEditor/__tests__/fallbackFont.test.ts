import { beforeEach, describe, expect, it, vi } from "vitest";
describe("bundled text fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("loads the Hebrew TrueType fallback before a Hebrew edit", async () => {
    const { isFallbackFontReady, preloadFallbackFontBytesForText } =
      await import("@app/tools/pdfTextEditor/util/fallbackFont");
    const hebrewBytes = new Uint8Array([0, 1, 2]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => hebrewBytes.buffer,
    } as Response);

    await preloadFallbackFontBytesForText("שלום עברית");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("NotoSansHebrew-Regular.ttf"),
    );
    expect(isFallbackFontReady()).toBe(true);
  });

  it("treats a failed bundled font load as unavailable", async () => {
    const { preloadFallbackFontBytesForText } =
      await import("@app/tools/pdfTextEditor/util/fallbackFont");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    await expect(
      preloadFallbackFontBytesForText("שלום עברית"),
    ).resolves.toBeUndefined();
  });
});
