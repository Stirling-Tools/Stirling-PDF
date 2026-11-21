// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfErrorCode } from "@embedpdf/models";
import { createStirlingFile } from "@editor/types/fileContext";
import {
  ensureLocalPdfAccess,
  getPdfAccess,
} from "@editor/services/pdfAccessService";
import {
  preflightPdfOperation,
  prepareUnlockedFile,
} from "@editor/services/pdfSessionUnlock";

vi.mock("@editor/services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("@editor/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfAccessService")
  >()),
  ensureLocalPdfAccess: vi.fn(),
}));
const inspect = vi.mocked(ensureLocalPdfAccess);
const repair = "/api/v1/misc/repair";
const unparseable = () =>
  Object.assign(new Error("Unable to open PDF"), {
    code: PdfErrorCode.WrongFormat,
  });
const pdf = (body: string) =>
  createStirlingFile(
    new File([body], "damaged.pdf", { type: "application/pdf" }),
  );

beforeEach(() => {
  inspect.mockReset();
});

describe("damaged PDFs", () => {
  it("passes unparseable bytes without an encryption hint to the server", async () => {
    inspect.mockImplementation(async () => {
      throw unparseable();
    });
    const file = pdf("%PDF-1.7 truncated");
    await expect(prepareUnlockedFile(file, repair)).resolves.toBe(file);
    await expect(
      preflightPdfOperation([file], repair, false, vi.fn()),
    ).resolves.toBe(true);
    // Nothing proved these bytes unencrypted, so no access is recorded.
    expect(getPdfAccess(file)).toBeUndefined();
  });

  it("still blocks unparseable bytes that look encrypted", async () => {
    inspect.mockImplementation(async () => {
      throw unparseable();
    });
    const file = pdf("%PDF-1.7 trailer << /Encrypt 5 0 R >>");
    await expect(prepareUnlockedFile(file, repair)).rejects.toThrow(
      "Unable to open PDF",
    );
  });

  it("lets a timed-out check through unless the file looks encrypted", async () => {
    inspect.mockImplementation(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const plain = pdf("%PDF-1.7");
    await expect(
      preflightPdfOperation([plain], repair, false, vi.fn()),
    ).resolves.toBe(true);
    expect(getPdfAccess(plain)).toBeUndefined();
    // Processing reuses preflight's verdict instead of waiting out another inspection.
    await expect(prepareUnlockedFile(plain, repair)).resolves.toBe(plain);
    expect(inspect).toHaveBeenCalledOnce();
    // Encrypted-looking files never get a cached pass, however often they are checked.
    const encrypted = pdf("%PDF-1.7 trailer << /Encrypt 5 0 R >>");
    for (let attempt = 0; attempt < 2; attempt++)
      await expect(
        preflightPdfOperation([encrypted], repair, false, vi.fn()),
      ).rejects.toMatchObject({ name: "TimeoutError" });
    await expect(prepareUnlockedFile(encrypted, repair)).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("drops pass-through verdicts when preflight does not proceed", async () => {
    inspect.mockImplementation(async (file) => {
      if ((file as File).name === "broken.pdf") throw new Error("broken");
      throw new DOMException("timed out", "TimeoutError");
    });
    const plain = pdf("%PDF-1.7");
    const broken = createStirlingFile(
      new File(["%PDF-1.7"], "broken.pdf", { type: "application/pdf" }),
    );
    await expect(
      preflightPdfOperation([plain, broken], repair, true, vi.fn()),
    ).rejects.toThrow("broken");
    inspect.mockClear();
    // A later operation inspects again rather than reusing the abandoned verdict.
    await expect(prepareUnlockedFile(plain, repair)).resolves.toBe(plain);
    expect(inspect).toHaveBeenCalledOnce();
  });

  it("cancels pending inspections when preflight fails early", async () => {
    let laterSignal: AbortSignal | undefined;
    inspect.mockImplementation(async (file, signal) => {
      if ((file as File).name === "first.pdf") throw new Error("broken");
      laterSignal = signal;
      return new Promise(() => {});
    });
    const named = (name: string) =>
      createStirlingFile(
        new File(["%PDF-1.7"], name, { type: "application/pdf" }),
      );
    const caller = new AbortController();
    await expect(
      preflightPdfOperation(
        [named("first.pdf"), named("second.pdf")],
        repair,
        true,
        vi.fn(),
        caller.signal,
      ),
    ).rejects.toThrow("broken");
    expect(laterSignal?.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(false);
  });

  it.each([
    ["a password failure", Object.assign(new Error("x"), { code: 4 })],
    ["a memory failure", new Error("Unable to allocate memory for this PDF")],
  ])("does not treat %s as damage", async (_, error) => {
    inspect.mockImplementation(async () => {
      throw error;
    });
    await expect(prepareUnlockedFile(pdf("%PDF-1.7"), repair)).rejects.toBe(
      error,
    );
  });
});
