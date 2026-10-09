import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PermissionFlag } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  defaultParameters,
  useChangePermissionsParameters,
} from "@app/hooks/tools/changePermissions/useChangePermissionsParameters";
import { usePermissionExtraction } from "@app/hooks/tools/changePermissions/usePermissionExtraction";

const { createDocument, destroyDocument } = vi.hoisted(() => ({
  createDocument: vi.fn(),
  destroyDocument: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: { createDocument, destroyDocument },
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

function mockPermissions(permissions: number[] | null) {
  const document = { getPermissions: vi.fn().mockResolvedValue(permissions) };
  createDocument.mockResolvedValueOnce(document);
  return document;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  createDocument.mockReset();
});

describe("usePermissionExtraction", () => {
  test.each([
    [PermissionFlag.ASSEMBLE, "preventAssembly"],
    [PermissionFlag.COPY, "preventExtractContent"],
    [PermissionFlag.COPY_FOR_ACCESSIBILITY, "preventExtractForAccessibility"],
    [PermissionFlag.FILL_INTERACTIVE_FORMS, "preventFillInForm"],
    [PermissionFlag.MODIFY_CONTENTS, "preventModify"],
    [PermissionFlag.MODIFY_ANNOTATIONS, "preventModifyAnnotations"],
    [PermissionFlag.PRINT, "preventPrinting"],
    [PermissionFlag.PRINT_HIGH_QUALITY, "preventPrintingFaithful"],
  ] as const)("maps missing permission %s to %s", async (flag, restriction) => {
    const document = mockPermissions(
      Object.values(PermissionFlag).filter((value) => value !== flag),
    );
    const file = new File([], "restricted.pdf");
    const { result } = renderExtraction(file);

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.parameters).toEqual({
      ...defaultParameters,
      [restriction]: true,
    });
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(createDocument).toHaveBeenCalledWith(
      "mocked-url",
      expect.objectContaining({ openTimeoutMs: 30_000 }),
    );
    expect(destroyDocument).toHaveBeenCalledWith(document);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("mocked-url");
  });

  test.each([null, Object.values(PermissionFlag)])(
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
    mockPermissions([]);
    const file = new File([], "first.pdf");
    const { result, rerender } = renderExtraction(file);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.updateParameter("preventPrinting", false));
    rerender({ file, enabled: true });
    expect(result.current.parameters.preventPrinting).toBe(false);
    expect(createDocument).toHaveBeenCalledTimes(1);

    mockPermissions(null);
    rerender({ file: new File([], "second.pdf"), enabled: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.parameters).toEqual(defaultParameters);
    expect(createDocument).toHaveBeenCalledTimes(2);
  });

  test("does not inspect a batch or empty selection and clears single-document values", async () => {
    const { result, rerender } = renderExtraction(undefined);
    expect(createDocument).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);

    mockPermissions([]);
    rerender({ file: new File([], "single.pdf"), enabled: true });
    await waitFor(() =>
      expect(result.current.parameters.preventPrinting).toBe(true),
    );

    rerender({ file: undefined, enabled: true });
    expect(result.current.parameters).toEqual(defaultParameters);
    act(() => result.current.updateParameter("preventPrinting", true));
    rerender({ file: undefined, enabled: true });
    expect(result.current.parameters.preventPrinting).toBe(true);
    expect(createDocument).toHaveBeenCalledTimes(1);
  });

  test("ignores late permissions from a previous selection", async () => {
    const stale = deferred<number[]>();
    const oldDocument = {
      getPermissions: vi.fn().mockReturnValue(stale.promise),
    };
    createDocument.mockResolvedValueOnce(oldDocument);
    const { result, rerender } = renderExtraction(new File([], "old.pdf"));
    await waitFor(() => expect(oldDocument.getPermissions).toHaveBeenCalled());

    mockPermissions(null);
    rerender({ file: new File([], "new.pdf"), enabled: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => stale.resolve([]));

    expect(result.current.parameters).toEqual(defaultParameters);
    expect(result.current.hasError).toBe(false);
    expect(destroyDocument).toHaveBeenCalledWith(oldDocument);
  });

  test("reloads a previous document when returning before the next one opens", async () => {
    mockPermissions([]);
    const first = new File([], "first.pdf");
    const { result, rerender } = renderExtraction(first);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const pending = deferred<{
      getPermissions: () => Promise<null>;
    }>();
    createDocument.mockReturnValueOnce(pending.promise);
    rerender({ file: new File([], "second.pdf"), enabled: true });

    mockPermissions([]);
    rerender({ file: first, enabled: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.parameters.preventPrinting).toBe(true);

    await act(async () =>
      pending.resolve({ getPermissions: async () => null }),
    );
    expect(result.current.parameters.preventPrinting).toBe(true);
  });

  test("releases documents that finish opening after unmount", async () => {
    const document = { getPermissions: vi.fn() };
    const pending = deferred<typeof document>();
    createDocument.mockReturnValueOnce(pending.promise);
    const { unmount } = renderExtraction(new File([], "pending.pdf"));
    unmount();
    await act(async () => pending.resolve(document));

    expect(document.getPermissions).not.toHaveBeenCalled();
    expect(destroyDocument).toHaveBeenCalledWith(document);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("mocked-url");
  });

  test.each(["open", "read"])(
    "reports %s failures and releases resources",
    async (stage) => {
      const document = {
        getPermissions: vi.fn().mockRejectedValue(new Error("Unreadable PDF")),
      };
      if (stage === "open")
        createDocument.mockRejectedValueOnce(new Error("Password required"));
      else createDocument.mockResolvedValueOnce(document);
      const { result } = renderExtraction(new File([], "broken.pdf"));
      await waitFor(() => expect(result.current.hasError).toBe(true));

      expect(result.current.isLoading).toBe(false);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("mocked-url");
      if (stage === "read")
        expect(destroyDocument).toHaveBeenCalledWith(document);
    },
  );

  test("preserves settings and results while processing, then reads the output when editing resumes", async () => {
    mockPermissions(null);
    const file = new File([], "input.pdf");
    const { result, rerender } = renderExtraction(file);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.updateParameter("preventPrinting", true));

    rerender({ file, enabled: false });
    rerender({ file, enabled: true });
    expect(result.current.parameters.preventPrinting).toBe(true);
    expect(createDocument).toHaveBeenCalledTimes(1);

    const output = new File([], "output.pdf");
    rerender({ file: output, enabled: false });
    expect(result.current.parameters.preventPrinting).toBe(true);
    expect(createDocument).toHaveBeenCalledTimes(1);

    mockPermissions([]);
    rerender({ file: output, enabled: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(createDocument).toHaveBeenCalledTimes(2);
    expect(result.current.parameters.preventModify).toBe(true);
  });
});
