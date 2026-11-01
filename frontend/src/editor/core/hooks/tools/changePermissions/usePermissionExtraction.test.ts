import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PdfPermissionFlag } from "@embedpdf/models";
import {
  defaultParameters,
  useChangePermissionsParameters,
} from "@editor/hooks/tools/changePermissions/useChangePermissionsParameters";
import { usePermissionExtraction } from "@editor/hooks/tools/changePermissions/usePermissionExtraction";
import {
  ensureLocalPdfAccess,
  clearPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@editor/services/pdfAccessService";

vi.mock("@editor/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfAccessService")
  >()),
  ensureLocalPdfAccess: vi.fn(),
}));
const inspect = vi.mocked(ensureLocalPdfAccess);
const access: PdfAccess = {
  password: "owner",
  encrypted: true,
  signed: false,
  ownerAuthenticated: true,
  permissions: PdfPermissionFlag.AllowAll,
  pageCount: 1,
};

function renderExtraction(file: File | undefined, enabled = true) {
  return renderHook(
    ({ file, enabled }) => {
      const params = useChangePermissionsParameters();
      return {
        ...usePermissionExtraction(file, params.setParameters, enabled),
        ...params,
      };
    },
    { initialProps: { file, enabled } },
  );
}

beforeEach(() => {
  clearPdfAccess();
  inspect.mockReset().mockResolvedValue(access);
});

describe("usePermissionExtraction", () => {
  test.each([1, 101 * 1024 * 1024])(
    "uses cached stored restrictions without parsing a %i-byte PDF",
    async (size) => {
      const file = new File([], "owner.pdf");
      Object.defineProperty(file, "size", { value: size });
      rememberPdfAccess(file, { ...access, permissions: 0 });
      const { result } = renderExtraction(file);
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.parameters.preventExtractContent).toBe(true);
      expect(result.current.parameters.preventPrinting).toBe(true);
      expect(inspect).not.toHaveBeenCalled();
    },
  );

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
  ] as const)("maps stored permission %s to %s", async (flag, restriction) => {
    const file = new File([], "restricted.pdf");
    rememberPdfAccess(file, {
      ...access,
      permissions: PdfPermissionFlag.AllowAll & ~flag,
    });
    const { result } = renderExtraction(file);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.parameters).toEqual({
      ...defaultParameters,
      [restriction]: true,
    });
  });

  test("falls back to the cancellable worker without imposing a size limit", async () => {
    const file = new File([], "large.pdf");
    Object.defineProperty(file, "size", { value: 101 * 1024 * 1024 });
    const { result } = renderExtraction(file);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(inspect).toHaveBeenCalledWith(file, expect.any(AbortSignal));
    expect(result.current.hasError).toBe(false);
  });

  test("cancels stale reads on selection changes and does not overwrite the new file", async () => {
    let finish!: (value: PdfAccess) => void;
    inspect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result, rerender } = renderExtraction(new File([], "old.pdf"));
    const signal = inspect.mock.calls[0][1];
    rerender({ file: new File([], "new.pdf"), enabled: true });
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => finish({ ...access, permissions: 0 }));
    expect(result.current.parameters).toEqual(defaultParameters);
  });

  test("aborts a pending read when unmounted", () => {
    inspect.mockReturnValueOnce(new Promise(() => {}));
    const { unmount } = renderExtraction(new File([], "pending.pdf"));
    const signal = inspect.mock.calls[0][1];
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  test("preserves edits across rerenders, processing, and batch selection", async () => {
    const file = new File([], "first.pdf");
    const { result, rerender } = renderExtraction(file);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.updateParameter("preventPrinting", true));
    rerender({ file, enabled: true });
    rerender({ file, enabled: false });
    rerender({ file, enabled: true });
    rerender({ file: undefined, enabled: true });
    expect(result.current.parameters.preventPrinting).toBe(true);
    expect(inspect).toHaveBeenCalledTimes(1);
    const output = new File([], "output.pdf");
    rerender({ file: output, enabled: false });
    expect(result.current.parameters.preventPrinting).toBe(true);
    rerender({ file: output, enabled: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.parameters).toEqual(defaultParameters);
  });

  test("keeps manual settings after a failed read until the file changes", async () => {
    inspect.mockRejectedValueOnce(new Error("Unreadable PDF"));
    const file = new File([], "broken.pdf");
    const { result, rerender } = renderExtraction(file);
    await waitFor(() => expect(result.current.hasError).toBe(true));
    act(() => result.current.updateParameter("preventPrinting", true));
    rerender({ file, enabled: false });
    rerender({ file, enabled: true });
    expect(result.current.parameters.preventPrinting).toBe(true);
    expect(inspect).toHaveBeenCalledTimes(1);
    rerender({ file: new File([], "next.pdf"), enabled: true });
    await waitFor(() => expect(result.current.hasError).toBe(false));
  });
});
