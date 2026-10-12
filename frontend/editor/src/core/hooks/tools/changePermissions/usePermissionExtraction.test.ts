import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PdfPermissionFlag } from "@embedpdf/models";
import {
  defaultParameters,
  useChangePermissionsParameters,
} from "@app/hooks/tools/changePermissions/useChangePermissionsParameters";
import { usePermissionExtraction } from "@app/hooks/tools/changePermissions/usePermissionExtraction";
import { runPdfiumScan } from "@app/services/pdfiumScanQueue";
import { LARGE_PDF_PARSE_LIMIT } from "@app/utils/thumbnailUtils";

const {
  getDocumentBytes,
  getPdfiumModule,
  openRawDocument,
  closeDocAndFreeBuffer,
  pdfiumModule,
} = vi.hoisted(() => ({
  getDocumentBytes: vi.fn(),
  getPdfiumModule: vi.fn(),
  openRawDocument: vi.fn(),
  closeDocAndFreeBuffer: vi.fn(),
  pdfiumModule: { FPDF_GetDocUserPermissions: vi.fn() },
}));

vi.mock("@app/services/documentBytesCache", () => ({ getDocumentBytes }));
vi.mock("@app/services/pdfiumService", () => ({
  getPdfiumModule,
  openRawDocument,
  closeDocAndFreeBuffer,
}));

function renderExtraction(file: File | undefined, enabled = true) {
  return renderHook(
    ({ file, enabled }) => {
      const params = useChangePermissionsParameters();
      const extraction = usePermissionExtraction(
        file,
        params.setParameters,
        enabled,
      );
      return { ...extraction, ...params };
    },
    { initialProps: { file, enabled } },
  );
}

function mockPermissions(permissions: number) {
  pdfiumModule.FPDF_GetDocUserPermissions.mockReturnValueOnce(permissions);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  getDocumentBytes.mockResolvedValue(new ArrayBuffer(0));
  getPdfiumModule.mockResolvedValue(pdfiumModule);
  openRawDocument.mockResolvedValue(1);
  pdfiumModule.FPDF_GetDocUserPermissions.mockReturnValue(
    PdfPermissionFlag.AllowAll,
  );
});

describe("usePermissionExtraction", () => {
  test.each([
    [PdfPermissionFlag.AssembleDocument, "preventAssembly"],
    [PdfPermissionFlag.CopyContents, "preventExtractContent"],
    [
      PdfPermissionFlag.ExtractForAccessibility,
      "preventExtractForAccessibility",
    ],
    [PdfPermissionFlag.FillForms, "preventFillInForm"],
    [PdfPermissionFlag.ModifyContents, "preventModify"],
    [PdfPermissionFlag.ModifyAnnotations, "preventModifyAnnotations"],
    [PdfPermissionFlag.Print, "preventPrinting"],
    [PdfPermissionFlag.PrintHighQuality, "preventPrintingFaithful"],
  ] as const)("maps missing permission %s to %s", async (flag, restriction) => {
    mockPermissions(PdfPermissionFlag.AllowAll & ~flag);
    const bytes = new ArrayBuffer(8);
    getDocumentBytes.mockResolvedValueOnce(bytes);
    const file = new File([], "restricted.pdf");
    const { result } = renderExtraction(file);

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.parameters).toEqual({
      ...defaultParameters,
      [restriction]: true,
    });
    expect(getDocumentBytes).toHaveBeenCalledWith(file);
    expect(openRawDocument).toHaveBeenCalledWith(bytes);
    expect(pdfiumModule.FPDF_GetDocUserPermissions).toHaveBeenCalledWith(1);
    expect(closeDocAndFreeBuffer).toHaveBeenCalledExactlyOnceWith(
      pdfiumModule,
      1,
    );
  });

  test.each([0xffffffff, -1, PdfPermissionFlag.AllowAll])(
    "allows everything when no restrictions are present (%s)",
    async (permissions) => {
      mockPermissions(permissions);
      const { result } = renderExtraction(new File([], "unrestricted.pdf"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.parameters).toEqual(defaultParameters);
      expect(result.current.hasError).toBe(false);
    },
  );

  test("refreshes for a different document without overwriting edits on rerender", async () => {
    mockPermissions(0);
    const file = new File([], "first.pdf");
    const { result, rerender } = renderExtraction(file);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.updateParameter("preventPrinting", false));
    rerender({ file, enabled: true });
    expect(result.current.parameters.preventPrinting).toBe(false);
    expect(openRawDocument).toHaveBeenCalledTimes(1);

    rerender({ file: new File([], "second.pdf"), enabled: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.parameters).toEqual(defaultParameters);
    expect(openRawDocument).toHaveBeenCalledTimes(2);
  });

  test("preserves batch settings and refreshes when returning to one PDF", async () => {
    const { result, rerender } = renderExtraction(undefined);
    expect(getDocumentBytes).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);

    const file = new File([], "single.pdf");
    mockPermissions(PdfPermissionFlag.AllowAll & ~PdfPermissionFlag.Print);
    rerender({ file, enabled: true });
    await waitFor(() =>
      expect(result.current.parameters.preventPrinting).toBe(true),
    );

    act(() => result.current.updateParameter("preventModify", true));
    const batchParameters = {
      ...defaultParameters,
      preventPrinting: true,
      preventModify: true,
    };
    rerender({ file: undefined, enabled: true });
    expect(result.current.parameters).toEqual(batchParameters);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(false);

    act(() => result.current.updateParameter("preventExtractContent", true));
    rerender({ file: undefined, enabled: false });
    rerender({ file: undefined, enabled: true });
    expect(result.current.parameters).toEqual({
      ...batchParameters,
      preventExtractContent: true,
    });
    expect(openRawDocument).toHaveBeenCalledTimes(1);

    rerender({ file, enabled: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.parameters).toEqual(defaultParameters);
    expect(openRawDocument).toHaveBeenCalledTimes(2);
  });

  test("serializes file switches and ignores a cancelled document", async () => {
    const pending = deferred<number>();
    openRawDocument.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderExtraction(new File([], "old.pdf"));
    await waitFor(() => expect(openRawDocument).toHaveBeenCalledTimes(1));

    rerender({ file: new File([], "new.pdf"), enabled: true });
    expect(getDocumentBytes).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.parameters).toEqual(defaultParameters);
    expect(result.current.hasError).toBe(false);
    expect(
      pdfiumModule.FPDF_GetDocUserPermissions,
    ).toHaveBeenCalledExactlyOnceWith(1);
    expect(closeDocAndFreeBuffer).toHaveBeenCalledWith(pdfiumModule, 2);
    expect(closeDocAndFreeBuffer).toHaveBeenCalledWith(pdfiumModule, 1);
  });

  test("reloads a previous document when returning before the next one opens", async () => {
    mockPermissions(0);
    const first = new File([], "first.pdf");
    const { result, rerender } = renderExtraction(first);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const pending = deferred<number>();
    openRawDocument.mockReturnValueOnce(pending.promise);
    rerender({ file: new File([], "second.pdf"), enabled: true });
    await waitFor(() => expect(openRawDocument).toHaveBeenCalledTimes(2));

    mockPermissions(0);
    rerender({ file: first, enabled: true });
    await act(async () => pending.resolve(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.parameters.preventPrinting).toBe(true);
    expect(openRawDocument).toHaveBeenCalledTimes(3);
    expect(closeDocAndFreeBuffer).toHaveBeenCalledWith(pdfiumModule, 2);
  });

  test("releases a document that finishes opening after unmount", async () => {
    const pending = deferred<number>();
    openRawDocument.mockReturnValueOnce(pending.promise);
    const { unmount } = renderExtraction(new File([], "pending.pdf"));
    await waitFor(() => expect(openRawDocument).toHaveBeenCalled());
    unmount();
    await act(async () => pending.resolve(2));

    expect(pdfiumModule.FPDF_GetDocUserPermissions).not.toHaveBeenCalled();
    expect(closeDocAndFreeBuffer).toHaveBeenCalledExactlyOnceWith(
      pdfiumModule,
      2,
    );
  });

  test("skips cancelled scans before they read file bytes", async () => {
    const pending = deferred<void>();
    const previousScan = runPdfiumScan(() => pending.promise);
    const { unmount } = renderExtraction(new File([], "queued.pdf"));
    unmount();
    await act(async () => {
      pending.resolve();
      await previousScan;
    });
    expect(getDocumentBytes).not.toHaveBeenCalled();
    expect(openRawDocument).not.toHaveBeenCalled();
  });

  test.each(["bytes", "initialize"])(
    "does not open a cancelled document after %s finishes",
    async (stage) => {
      const pending = deferred<void>();
      const read = stage === "bytes" ? getDocumentBytes : getPdfiumModule;
      const value = stage === "bytes" ? new ArrayBuffer(0) : pdfiumModule;
      read.mockReturnValueOnce(pending.promise.then(() => value));
      const { unmount } = renderExtraction(new File([], "cancelled.pdf"));
      await waitFor(() => expect(read).toHaveBeenCalled());
      unmount();
      await act(async () => pending.resolve());
      expect(openRawDocument).not.toHaveBeenCalled();
    },
  );

  test.each(["bytes", "initialize", "open", "read"])(
    "preserves manual settings after %s failures when detection resumes",
    async (stage) => {
      const failure = new Error("Unreadable PDF");
      if (stage === "bytes") getDocumentBytes.mockRejectedValueOnce(failure);
      else if (stage === "initialize")
        getPdfiumModule.mockRejectedValueOnce(failure);
      else if (stage === "open") openRawDocument.mockRejectedValueOnce(failure);
      else
        pdfiumModule.FPDF_GetDocUserPermissions.mockImplementationOnce(() => {
          throw failure;
        });
      const file = new File([], "broken.pdf");
      const { result, rerender } = renderExtraction(file);
      await waitFor(() => expect(result.current.hasError).toBe(true));

      expect(result.current.isLoading).toBe(false);
      if (stage === "read")
        expect(closeDocAndFreeBuffer).toHaveBeenCalledExactlyOnceWith(
          pdfiumModule,
          1,
        );
      else expect(closeDocAndFreeBuffer).not.toHaveBeenCalled();

      act(() => result.current.updateParameter("preventPrinting", true));
      rerender({ file, enabled: false });
      rerender({ file, enabled: true });

      expect(result.current.parameters.preventPrinting).toBe(true);
      expect(result.current.hasError).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(getDocumentBytes).toHaveBeenCalledTimes(1);

      mockPermissions(0);
      rerender({ file: new File([], "readable.pdf"), enabled: true });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.hasError).toBe(false);
      expect(result.current.parameters.preventModify).toBe(true);
      expect(getDocumentBytes).toHaveBeenCalledTimes(2);
    },
  );

  test("leaves oversized documents manual without reading them into memory", async () => {
    const file = new File([], "large.pdf");
    Object.defineProperty(file, "size", { value: LARGE_PDF_PARSE_LIMIT });
    const { result } = renderExtraction(file);
    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(getDocumentBytes).not.toHaveBeenCalled();
    expect(openRawDocument).not.toHaveBeenCalled();
    act(() => result.current.updateParameter("preventPrinting", true));
    expect(result.current.parameters.preventPrinting).toBe(true);
  });

  test("preserves settings and results while processing, then reads the output when editing resumes", async () => {
    const file = new File([], "input.pdf");
    const { result, rerender } = renderExtraction(file);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.updateParameter("preventPrinting", true));

    rerender({ file, enabled: false });
    rerender({ file, enabled: true });
    expect(result.current.parameters.preventPrinting).toBe(true);
    expect(openRawDocument).toHaveBeenCalledTimes(1);

    const output = new File([], "output.pdf");
    rerender({ file: output, enabled: false });
    expect(result.current.parameters.preventPrinting).toBe(true);
    expect(openRawDocument).toHaveBeenCalledTimes(1);

    mockPermissions(0);
    rerender({ file: output, enabled: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(openRawDocument).toHaveBeenCalledTimes(2);
    expect(result.current.parameters.preventModify).toBe(true);
  });
});
