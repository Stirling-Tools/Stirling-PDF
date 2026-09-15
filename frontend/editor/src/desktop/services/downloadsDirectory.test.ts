import { beforeEach, describe, expect, it, vi } from "vitest";

const { downloadDirMock } = vi.hoisted(() => ({ downloadDirMock: vi.fn() }));

vi.mock("@tauri-apps/api/path", () => ({ downloadDir: downloadDirMock }));

import { getDownloadsDirectory } from "@app/services/downloadsDirectory";

/** The only project where @app/* resolves the desktop implementation rather than the core stub. */
describe("getDownloadsDirectory (desktop)", () => {
  beforeEach(() => {
    // Braces matter: mockReset() returns the mock for chaining, and a function returned from a
    // hook is treated as a teardown callback — which would call the mock after every test.
    downloadDirMock.mockReset();
  });

  it("returns the path the OS reports", async () => {
    downloadDirMock.mockResolvedValue("/Users/ada/Downloads");
    await expect(getDownloadsDirectory()).resolves.toBe("/Users/ada/Downloads");
  });

  it("answers null rather than throwing when the OS has no Downloads directory", async () => {
    downloadDirMock.mockImplementation(() => {
      throw new Error("no Download dir");
    });
    await expect(getDownloadsDirectory()).resolves.toBeNull();
  });

  it("answers null when access is refused, so the offer simply does not appear", async () => {
    downloadDirMock.mockImplementation(() => {
      throw new Error("forbidden path");
    });
    await expect(getDownloadsDirectory()).resolves.toBeNull();
  });
});
