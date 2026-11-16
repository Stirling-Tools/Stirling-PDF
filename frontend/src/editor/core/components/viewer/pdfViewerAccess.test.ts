import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PdfErrorCode,
  PdfTaskHelper,
  type PdfDocumentObject,
  type PdfEngine,
} from "@embedpdf/models";
import {
  bindPdfViewerSource,
  withPdfViewerAccess,
} from "@editor/components/viewer/pdfViewerAccess";
import {
  clearPdfAccess,
  forgetPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
  rememberPlainPdfExport,
  ensureLocalPdfAccess,
} from "@editor/services/pdfAccessService";

import { createStirlingFile } from "@editor/types/fileContext";

vi.mock("@editor/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfAccessService")
  >()),
  ensureLocalPdfAccess: vi.fn(),
}));
const document: PdfDocumentObject = {
  id: "opened",
  pageCount: 1,
  pages: [],
  isEncrypted: false,
  isOwnerUnlocked: true,
  permissions: -4,
  normalizedRotation: false,
};
const protectedAccess = {
  password: "",
  encrypted: true,
  signed: false,
  ownerAuthenticated: false,
  permissions: 4,
  pageCount: 1,
};

function viewer(file: File) {
  const buffer = new ArrayBuffer(8);
  bindPdfViewerSource(buffer, file);
  const opened = PdfTaskHelper.create<PdfDocumentObject>();
  const close = vi.fn(() => PdfTaskHelper.resolve(true));
  const raw = {
    openDocumentBuffer: vi.fn(() => opened),
    closeDocument: close,
  };
  const engine = withPdfViewerAccess(raw as unknown as PdfEngine<Blob>);
  return { engine, opened, close, raw, buffer };
}

beforeEach(() => {
  clearPdfAccess();
  vi.mocked(ensureLocalPdfAccess).mockReset();
});

describe("viewer permission readiness", () => {
  it("publishes verified access before opening completes without an extra read", async () => {
    const file = new File(["PDF"], "sample.pdf");
    const read = vi.fn();
    Object.defineProperty(file, "arrayBuffer", { value: read });
    const { engine, opened, raw, buffer } = viewer(file);
    const task = engine.openDocumentBuffer({ id: "opened", content: buffer });
    const ready = vi.fn(() =>
      expect(getPdfAccess(file)?.encrypted).toBe(false),
    );
    task.wait(ready, () => {});
    expect(ready).not.toHaveBeenCalled();
    opened.resolve(document);
    await task.toPromise();
    expect(ready).toHaveBeenCalledOnce();
    expect(raw.openDocumentBuffer).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
  });

  it("does not publish unrestricted access while encrypted authentication is pending", async () => {
    const file = new File(["protected"], "large.pdf");
    Object.defineProperty(file, "size", { value: 125 * 1024 ** 2 });
    let finish!: (value: typeof protectedAccess) => void;
    vi.mocked(ensureLocalPdfAccess).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = (access) => resolve(rememberPdfAccess(file, access));
        }),
    );
    const { engine, opened, buffer } = viewer(file);
    const task = engine.openDocumentBuffer({ id: "opened", content: buffer });
    const ready = vi.fn();
    task.wait(ready, () => {});
    opened.resolve({
      ...document,
      isEncrypted: true,
      isOwnerUnlocked: false,
      permissions: 4,
    });
    expect(getPdfAccess(file)).toBeUndefined();
    expect(ready).not.toHaveBeenCalled();
    finish(protectedAccess);
    await task.toPromise();
    expect(getPdfAccess(file)).toMatchObject({
      encrypted: true,
      ownerAuthenticated: false,
    });
  });

  it("rejects incomplete engine security metadata instead of granting access", async () => {
    const file = new File(["PDF"], "sample.pdf");
    const { engine, opened, close, buffer } = viewer(file);
    const task = engine.openDocumentBuffer({ id: "opened", content: buffer });
    const rejected = expect(task.toPromise()).rejects.toBeDefined();
    opened.resolve({
      ...document,
      isEncrypted: undefined,
    } as unknown as PdfDocumentObject);
    await rejected;
    expect(getPdfAccess(file)).toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it("preserves PDFium password errors for the shared password prompt", async () => {
    const file = new File(["PDF"], "protected.pdf");
    const { engine, opened, buffer } = viewer(file);
    const task = engine.openDocumentBuffer({ id: "opened", content: buffer });
    const rejected = expect(task.toPromise()).rejects.toMatchObject({
      reason: { code: PdfErrorCode.Password },
    });
    opened.reject({
      code: PdfErrorCode.Password,
      message: "Password required",
    });
    await rejected;
    expect(getPdfAccess(file)).toBeUndefined();
  });

  it("keeps ordinary exports ready through new FileContext identities without granting access to unrelated bytes", async () => {
    const source = new File(["original"], "sample.pdf");
    const { engine, opened, buffer } = viewer(source);
    const task = engine.openDocumentBuffer({ id: "opened", content: buffer });
    opened.resolve(document);
    await task.toPromise();
    const saved = new File(["saved"], "sample.pdf");
    rememberPlainPdfExport(source, saved);
    const assigned = createStirlingFile(saved);
    expect(getPdfAccess(assigned.fileId)?.encrypted).toBe(false);
    expect(getPdfAccess(new File(["saved"], "sample.pdf"))).toBeUndefined();
    rememberPdfAccess(source, protectedAccess);
    const protectedOutput = new File(["changed"], "sample.pdf");
    rememberPlainPdfExport(source, protectedOutput);
    expect(getPdfAccess(protectedOutput)).toBeUndefined();
  });

  it.each(["close", "logout"])(
    "does not restore access after %s while PDFium is opening",
    async (action) => {
      const file = createStirlingFile(new File(["PDF"], "sample.pdf"));
      const { engine, opened, close, buffer } = viewer(file);
      const task = engine.openDocumentBuffer({ id: "opened", content: buffer });
      const rejected = expect(task.toPromise()).rejects.toBeDefined();
      if (action === "close") forgetPdfAccess([file.fileId]);
      else clearPdfAccess();
      opened.resolve(document);
      await rejected;
      expect(getPdfAccess(file)).toBeUndefined();
      expect(close).toHaveBeenCalledOnce();
    },
  );
});
