import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "@app/services/apiClient";
import { createStirlingFile } from "@app/types/fileContext";
import {
  clearPdfAccess,
  forgetPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@app/services/pdfPasswordStore";
import {
  prepareUnlockedFile,
  protectUnlockedResults,
  unlockPdfForSession,
} from "@app/services/pdfSessionUnlock";

vi.mock("@app/services/apiClient", () => ({ default: { post: vi.fn() } }));
const post = vi.mocked(apiClient.post);
const access: PdfAccess = {
  password: " password\n",
  encrypted: true,
  signed: false,
  ownerAuthenticated: false,
  permissions: -4,
  canModify: true,
  canAssemble: true,
  pageCount: 2,
};
const rotate = "/api/v1/general/rotate-pdf";

beforeEach(() => {
  clearPdfAccess();
  post.mockReset();
});
afterEach(clearPdfAccess);

describe("session PDF access", () => {
  it("authenticates without rewriting bytes or retaining credentials before adoption", async () => {
    const original = createStirlingFile(new File(["encrypted"], "locked.pdf"));
    const { password, ...info } = access;
    post.mockResolvedValueOnce({ data: info });
    expect(await unlockPdfForSession(original, password)).toEqual(access);
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0][0]).toBe("/api/v1/security/inspect-pdf-security");
    const form = post.mock.calls[0][1] as FormData;
    expect(form.get("fileInput")).toBe(original);
    expect(form.get("password")).toBe(password);
    expect(getPdfAccess(original)).toBeUndefined();
  });

  it("does not cache a rejected password", async () => {
    const original = new File(["encrypted"], "locked.pdf");
    post.mockRejectedValueOnce(new Error("Incorrect password"));
    await expect(unlockPdfForSession(original, "wrong")).rejects.toThrow(
      "Incorrect password",
    );
    expect(getPdfAccess(original)).toBeUndefined();
  });

  it("isolates same-name files and drops access when a document closes", () => {
    const first = createStirlingFile(new File(["one"], "locked.pdf"));
    const second = createStirlingFile(new File(["two"], "locked.pdf"));
    rememberPdfAccess(first, access);
    expect(getPdfAccess(first.fileId)).toEqual(access);
    expect(getPdfAccess(second)).toBeUndefined();
    expect(Object.keys(first)).not.toContain("password");
    forgetPdfAccess([first.fileId]);
    expect(getPdfAccess(first)).toBeUndefined();
    expect(getPdfAccess(first.fileId)).toBeUndefined();
  });

  it("uses a temporary decrypted copy without transferring credentials to it", async () => {
    const original = createStirlingFile(new File(["encrypted"], "locked.pdf"));
    rememberPdfAccess(original, access);
    post.mockResolvedValueOnce({ data: new Blob(["decrypted"]) });
    const working = await prepareUnlockedFile(original, rotate);
    expect(working).not.toBe(original);
    expect(working.name).toBe(original.name);
    expect(getPdfAccess(working)).toBeUndefined();
    expect(getPdfAccess(original.fileId)).toEqual(access);
  });

  it("requires a fresh unlock when different bytes replace an existing file identity", () => {
    const original = createStirlingFile(new File(["old"], "locked.pdf"));
    rememberPdfAccess(original, access);
    const replacement = createStirlingFile(
      new File(["new"], "locked.pdf"),
      original.fileId,
    );
    expect(getPdfAccess(replacement)).toBeUndefined();
    expect(getPdfAccess(original.fileId)).toBeUndefined();
    expect(getPdfAccess(original)).toBeUndefined();
  });

  it.each([
    ["/api/v1/security/auto-redact", access, "does not yet support"],
    [rotate, { ...access, signed: true }, "digital signatures"],
    [rotate, { ...access, canAssemble: false }, "restricts"],
  ])(
    "rejects unsupported or restricted processing before decrypting",
    async (endpoint, permission, message) => {
      const original = createStirlingFile(
        new File(["encrypted"], "locked.pdf"),
      );
      rememberPdfAccess(original, permission);
      await expect(prepareUnlockedFile(original, endpoint)).rejects.toThrow(
        message,
      );
      expect(post).not.toHaveBeenCalled();
    },
  );

  it("decrypts a mixed-password merge independently and inherits its first protected input", async () => {
    const first = createStirlingFile(new File(["a"], "first.pdf"));
    const second = createStirlingFile(new File(["b"], "second.pdf"));
    rememberPdfAccess(first, access);
    rememberPdfAccess(second, { ...access, password: "second-password" });
    post.mockResolvedValue({ data: new Blob(["result"]) });
    const merge = "/api/v1/general/merge-pdfs";
    await prepareUnlockedFile(first, merge);
    await prepareUnlockedFile(second, merge);
    const [result] = await protectUnlockedResults(
      [new File(["merged"], "merged.pdf")],
      [first, second],
      merge,
    );
    expect((post.mock.calls[0][1] as FormData).get("password")).toBe(
      access.password,
    );
    expect((post.mock.calls[1][1] as FormData).get("password")).toBe(
      "second-password",
    );
    const restore = post.mock.calls[2][1] as FormData;
    expect(restore.get("sourceFile")).toBe(first);
    expect(restore.get("password")).toBe(access.password);
    expect(getPdfAccess(result)).toEqual(access);
  });

  it("returns no partial output if protection restoration fails", async () => {
    const original = new File(["encrypted"], "locked.pdf");
    rememberPdfAccess(original, access);
    const outputs = [
      new File(["one"], "one.pdf"),
      new File(["two"], "two.pdf"),
    ];
    post
      .mockResolvedValueOnce({ data: new Blob(["protected"]) })
      .mockRejectedValueOnce(new Error("qpdf unavailable"));
    await expect(
      protectUnlockedResults(outputs, [original], rotate),
    ).rejects.toThrow("No unprotected result was saved");
    expect(outputs.every((file) => !getPdfAccess(file))).toBe(true);
  });

  it("leaves explicit Remove Password output unprotected", async () => {
    const original = createStirlingFile(new File(["encrypted"], "locked.pdf"));
    rememberPdfAccess(original, access);
    const endpoint = "/api/v1/security/remove-password";
    const outputs = [new File(["plain"], "plain.pdf")];
    expect(await prepareUnlockedFile(original, endpoint)).toBe(original);
    expect(await protectUnlockedResults(outputs, [original], endpoint)).toBe(
      outputs,
    );
    expect(post).not.toHaveBeenCalled();
  });
});
