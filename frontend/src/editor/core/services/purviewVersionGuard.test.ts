import { describe, expect, it, vi } from "vitest";

const protectedBlobs = new WeakSet<Blob>();
vi.mock("@editor/services/rightsManagedPdf", () => ({
  isMicrosoftProtectedPdf: async (blob: Blob) => protectedBlobs.has(blob),
}));

const { assertOutputsKeepPurviewProtection } =
  await import("@editor/services/purviewVersionGuard");

const pdf = (isProtected: boolean) => {
  const blob = new Blob(["%PDF"]);
  if (isProtected) protectedBlobs.add(blob);
  return blob;
};

describe("assertOutputsKeepPurviewProtection", () => {
  it("refuses a decrypted output of a protected parent", async () => {
    await expect(
      assertOutputsKeepPurviewProtection([pdf(true)], [pdf(false)]),
    ).rejects.toThrow("unprotected copy of a Microsoft Purview protected PDF");
  });

  it("refuses when any one of several outputs lost its protection", async () => {
    await expect(
      assertOutputsKeepPurviewProtection(
        [pdf(false), pdf(true)],
        [pdf(true), pdf(false)],
      ),
    ).rejects.toThrow();
  });

  it("accepts re-protected outputs", async () => {
    await expect(
      assertOutputsKeepPurviewProtection([pdf(true)], [pdf(true)]),
    ).resolves.toBeUndefined();
  });

  it("leaves ordinary files alone", async () => {
    await expect(
      assertOutputsKeepPurviewProtection([pdf(false)], [pdf(false)]),
    ).resolves.toBeUndefined();
  });
});
