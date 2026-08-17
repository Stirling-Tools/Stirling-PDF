import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";

/**
 * Tests for the one thing the bell asks about a failed document here: whether it is
 * still in this browser, which is what decides if it can be opened.
 */

const getStirlingFileStub = vi.fn();

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFileStub: (...args: unknown[]) => getStirlingFileStub(...args),
  },
}));

const { hasLocalFile } = await import("@app/services/localFilePresence");

beforeEach(() => {
  getStirlingFileStub.mockReset().mockResolvedValue(null);
});

describe("hasLocalFile", () => {
  it("is false once the document has left this browser", async () => {
    getStirlingFileStub.mockResolvedValue(null);

    await expect(hasLocalFile("f-1")).resolves.toBe(false);
    await expect(hasLocalFile(null)).resolves.toBe(false);
  });

  it("is true while the document is still stored here", async () => {
    getStirlingFileStub.mockResolvedValue({ id: "f-1", name: "doc.pdf" });

    await expect(hasLocalFile("f-1")).resolves.toBe(true);
  });
});
