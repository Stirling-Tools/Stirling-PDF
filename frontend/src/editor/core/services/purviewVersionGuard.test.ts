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
  it.each([
    ["re-protected outputs", [{ output: pdf(true), sources: [pdf(true)] }]],
    ["ordinary files", [{ output: pdf(false), sources: [pdf(false)] }]],
    [
      "plain files edited alongside a protected one",
      [
        { output: pdf(true), sources: [pdf(true)] },
        { output: pdf(false), sources: [pdf(false)] },
      ],
    ],
  ])("accepts %s", async (_, derived) => {
    await expect(
      assertOutputsKeepPurviewProtection(derived),
    ).resolves.toBeUndefined();
  });

  it.each([
    [
      "a decrypted version of a protected file",
      [{ output: pdf(false), sources: [pdf(true)] }],
    ],
    [
      "an unprotected merge of a protected and a plain file",
      [{ output: pdf(false), sources: [pdf(false), pdf(true)] }],
    ],
    [
      "one decrypted output among several",
      [
        { output: pdf(true), sources: [pdf(true)] },
        { output: pdf(false), sources: [pdf(true)] },
      ],
    ],
  ])("refuses %s", async (_, derived) => {
    await expect(assertOutputsKeepPurviewProtection(derived)).rejects.toThrow(
      "unprotected copy of a Microsoft Purview protected PDF",
    );
  });
});
