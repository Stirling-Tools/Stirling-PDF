import type { ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FileContextProvider,
  useFileActions,
  useFileSelectors,
} from "@editor/contexts/FileContext";
import apiClient from "@editor/services/apiClient";
import {
  getPdfAccess,
  rememberPdfAccess,
  bindPdfAccess,
} from "@editor/services/pdfAccessService";

import { fileStorage } from "@editor/services/fileStorage";
import { generateProcessedFileMetadata } from "@editor/contexts/file/fileActions";
import { generateThumbnailPairWithMetadata } from "@editor/utils/thumbnailUtils";
import {
  createStirlingFile,
  createNewStirlingFileStub,
  type FileId,
  type StirlingFileStub,
} from "@editor/types/fileContext";
import {
  isAwaitingUnlock,
  setPendingUnlocks,
} from "@editor/services/pendingUnlocks";

const observed = vi.hoisted(() => ({
  isEncrypted: true,
  requiresOpeningPassword: true as boolean | undefined,
  heldBeforeEffects: false,
  afterDispatch: undefined as (() => Promise<void>) | undefined,
  thumbnailUrl: undefined as string | undefined,
}));
const id = "editor-encrypted" as FileId;
const localInspection = vi.hoisted(() => vi.fn());

vi.mock("@editor/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfAccessService")
  >()),
  inspectLocalPdfAccess: async (
    file: File,
    password: string,
    signal?: AbortSignal,
  ) => ({
    ...(await localInspection(file, password, signal)).data,
    password,
  }),
}));

vi.mock("@editor/services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("@editor/utils/thumbnailUtils", () => ({
  generateThumbnailPairWithMetadata: vi.fn(),
}));

vi.mock("@editor/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => null,
}));
vi.mock("@editor/hooks/tools/shared/useResolutionContinuation", () => ({
  useResolutionContinuation: () => vi.fn(),
}));
vi.mock("@editor/hooks/useZipConfirmation", () => ({
  useZipConfirmation: () => ({
    confirmationState: { opened: false },
    requestConfirmation: vi.fn(),
    handleConfirm: vi.fn(),
    handleCancel: vi.fn(),
  }),
}));
vi.mock("@editor/components/shared/ZipWarningModal", () => ({
  default: () => null,
}));
vi.mock("@editor/components/shared/EncryptedPdfUnlockModal", () => ({
  default: ({
    opened,
    onSkip,
    onUnlock,
    onRemovePassword,
    ownerUnlock,
    errorMessage,
    password,
    onPasswordChange,
    inspection,
  }: {
    opened: boolean;
    onSkip: () => void;
    onUnlock: () => void;
    onRemovePassword?: () => void;
    ownerUnlock?: boolean;
    errorMessage?: string | null;
    password: string;
    onPasswordChange: (password: string) => void;
    inspection?: { error?: string; retry: () => void };
  }) =>
    opened ? (
      <>
        <button onClick={onSkip}>Cancel opening</button>
        {inspection ? (
          <>
            <span role={inspection.error ? "alert" : "status"}>
              {inspection.error ?? "Checking permissions"}
            </span>
            {inspection.error && (
              <button onClick={inspection.retry}>Retry inspection</button>
            )}
          </>
        ) : (
          <>
            <input
              aria-label={ownerUnlock ? "Permissions password" : "PDF password"}
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
            />
            <button onClick={onUnlock}>Unlock</button>
            {!ownerUnlock && onRemovePassword && (
              <button onClick={onRemovePassword}>Remove Password</button>
            )}
            {errorMessage && <span role="alert">{errorMessage}</span>}
          </>
        )}
      </>
    ) : null,
}));
vi.mock("@editor/contexts/file/fileActions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@editor/contexts/file/fileActions")>();
  return {
    ...actual,
    generateProcessedFileMetadata: vi
      .fn()
      .mockResolvedValue({ pages: [], totalPages: 1 }),
    addFiles: vi.fn<typeof actual.addFiles>(
      async (options, _stateRef, filesRef, dispatch) => {
        const source = options.files?.[0];
        if (!source) throw new Error("No test file supplied");
        const file = createStirlingFile(source, id);
        const stub: StirlingFileStub = {
          id,
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          isLeaf: true,
          originalFileId: id,
          versionNumber: 1,
          thumbnailUrl: observed.thumbnailUrl,
          processedFile: {
            pages: [],
            isEncrypted: observed.isEncrypted,
            requiresOpeningPassword: observed.requiresOpeningPassword,
          },
        };
        filesRef.current.set(id, file);
        dispatch({ type: "ADD_FILES", payload: { stirlingFileStubs: [stub] } });
        observed.heldBeforeEffects = isAwaitingUnlock(id);
        await observed.afterDispatch?.();
        return [file];
      },
    ),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <FileContextProvider enablePersistence={false} enableUrlSync={false}>
      {children}
    </FileContextProvider>
  );
}

beforeEach(() => {
  vi.mocked(apiClient.post).mockReset();
  localInspection.mockReset();
  vi.mocked(generateProcessedFileMetadata).mockResolvedValue({
    pages: [],
    totalPages: 1,
    isEncrypted: false,
  });
  observed.isEncrypted = true;
  observed.requiresOpeningPassword = true;
  observed.heldBeforeEffects = false;
  observed.afterDispatch = undefined;
  observed.thumbnailUrl = undefined;
  setPendingUnlocks([]);
});

describe("deferred opening inspection", () => {
  it.each([false, true])(
    "hydrates page geometry after admission without losing its thumbnail, closed: %s",
    async (closed) => {
      observed.requiresOpeningPassword = undefined;
      observed.thumbnailUrl = "data:image/png;base64,existing";
      localInspection.mockResolvedValueOnce({
        data: {
          encrypted: true,
          signed: false,
          ownerAuthenticated: false,
          permissions: 0,
          pageCount: 1,
          requiresOpeningPassword: false,
        },
      });
      let finish!: (
        metadata: Awaited<ReturnType<typeof generateThumbnailPairWithMetadata>>,
      ) => void;
      vi.mocked(generateThumbnailPairWithMetadata).mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const { result } = renderHook(
        () => ({ ...useFileActions(), selectors: useFileSelectors() }),
        { wrapper },
      );
      const file = new File(["encrypted"], "rotated.pdf", {
        type: "application/pdf",
      });
      let loading!: ReturnType<typeof result.current.actions.addFiles>;
      await act(async () => {
        loading = result.current.actions.addFiles([file]);
      });
      await expect(loading).resolves.toEqual([file]);
      expect(
        result.current.selectors.getStirlingFileStub(id)?.thumbnailUrl,
      ).toBe(observed.thumbnailUrl);
      await waitFor(() => expect(finish).toBeDefined());
      if (closed)
        await act(() => result.current.actions.removeFiles([id], false));
      const metadata = {
        thumbnail: "data:image/png;base64,new",
        pageCount: 1,
        pageRotations: [90],
        pageDimensions: [{ width: 600, height: 800 }],
        isEncrypted: false,
      };
      await act(async () => finish({ unrotated: metadata, rotated: metadata }));
      if (closed) expect(result.current.selectors.getAllFileIds()).toEqual([]);
      else
        expect(result.current.selectors.getStirlingFileStub(id)).toMatchObject({
          thumbnailUrl: observed.thumbnailUrl,
          processedFile: {
            isEncrypted: true,
            requiresOpeningPassword: false,
            pages: [{ rotation: 90, width: 600, height: 800 }],
          },
        });
    },
  );
  it("cancels a pending check without admitting its late result", async () => {
    observed.requiresOpeningPassword = undefined;
    let finish!: (value: unknown) => void;
    localInspection.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(
      () => ({ ...useFileActions(), selectors: useFileSelectors() }),
      { wrapper },
    );
    const file = new File(["encrypted"], "pending.pdf");
    let loading!: ReturnType<typeof result.current.actions.addFiles>;
    await act(async () => {
      loading = result.current.actions.addFiles([file]);
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking permissions",
    );
    const signal = localInspection.mock.calls[0][2] as AbortSignal;
    await act(async () => fireEvent.click(screen.getByText("Cancel opening")));
    expect(signal.aborted).toBe(true);
    await expect(loading).resolves.toEqual([]);
    await act(async () =>
      finish({
        data: {
          encrypted: true,
          pageCount: 1,
          ownerAuthenticated: false,
          permissions: 0,
          signed: false,
        },
      }),
    );
    expect(getPdfAccess(file)).toBeUndefined();
    expect(result.current.selectors.getAllFileIds()).toEqual([]);
  });
  it.each([1024, 150 * 1024 * 1024])(
    "opens a %i-byte restriction-only PDF without asking for a password",
    async (size) => {
      observed.requiresOpeningPassword = undefined;
      localInspection.mockResolvedValueOnce({
        data: {
          encrypted: true,
          signed: false,
          ownerAuthenticated: false,
          permissions: 0,
          pageCount: 1,
          requiresOpeningPassword: false,
        },
      });
      const file = new File(["encrypted"], "restrictions.pdf");
      Object.defineProperty(file, "size", { value: size });
      const { result } = renderHook(
        () => ({ ...useFileActions(), selectors: useFileSelectors() }),
        { wrapper },
      );
      let loading!: ReturnType<typeof result.current.actions.addFiles>;
      await act(async () => {
        loading = result.current.actions.addFiles([file]);
      });
      await expect(loading).resolves.toEqual([file]);
      expect(localInspection).toHaveBeenCalledExactlyOnceWith(
        file,
        "",
        expect.any(AbortSignal),
      );
      expect(getPdfAccess(file)).toMatchObject({
        encrypted: true,
        ownerAuthenticated: false,
        permissions: 0,
      });
      expect(screen.queryByLabelText("PDF password")).not.toBeInTheDocument();
    },
  );

  it("keeps a timed-out inspection unresolved and supports retry", async () => {
    observed.requiresOpeningPassword = undefined;
    localInspection.mockRejectedValueOnce(
      new DOMException("Inspection timed out", "TimeoutError"),
    );
    const { result } = renderHook(
      () => ({ ...useFileActions(), selectors: useFileSelectors() }),
      { wrapper },
    );
    const file = new File(["encrypted"], "unknown.pdf");
    let loading!: ReturnType<typeof result.current.actions.addFiles>;
    await act(async () => {
      loading = result.current.actions.addFiles([file]);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "encryptedPdfUnlock.inspectionFailed",
    );
    expect(screen.queryByText("Inspection timed out")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("PDF password")).not.toBeInTheDocument();
    expect(getPdfAccess(file)).toBeUndefined();
    localInspection.mockRejectedValueOnce(
      Object.assign(new Error("Password required"), { code: 4 }),
    );
    await act(async () =>
      fireEvent.click(screen.getByText("Retry inspection")),
    );
    expect(screen.getByLabelText("PDF password")).toBeVisible();
    await act(async () => fireEvent.click(screen.getByText("Cancel opening")));
    await expect(loading).resolves.toEqual([]);
  });

  it("prompts directly when the opening-password requirement is already known", async () => {
    const { result } = renderHook(() => useFileActions(), { wrapper });
    let loading!: ReturnType<typeof result.current.actions.addFiles>;
    await act(async () => {
      loading = result.current.actions.addFiles([
        new File(["encrypted"], "known.pdf"),
      ]);
    });
    expect(screen.getByLabelText("PDF password")).toBeVisible();
    expect(localInspection).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByText("Cancel opening")));
    await expect(loading).resolves.toEqual([]);
  });
});

describe("protected tool replacements", () => {
  beforeEach(() => {
    observed.isEncrypted = false;
    vi.spyOn(fileStorage, "persistVersionedOutputs").mockResolvedValue();
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["cancel", "unlock"])(
    "retains inputs until %s settles the output",
    async (decision) => {
      const { result } = renderHook(
        () => ({ ...useFileActions(), selectors: useFileSelectors() }),
        { wrapper },
      );
      await act(() =>
        result.current.actions.addFiles([new File(["original"], "source.pdf")]),
      );
      const output = createStirlingFile(
        new File(["encrypted"], "protected.pdf"),
      );
      const stub = createNewStirlingFileStub(output, output.fileId, undefined, {
        pages: [],
        isEncrypted: true,
        requiresOpeningPassword: true,
      });
      let consuming!: ReturnType<typeof result.current.actions.consumeFiles>;
      await act(async () => {
        consuming = result.current.actions.consumeFiles(
          [id],
          [output],
          [stub],
          { silent: true },
        );
      });
      expect(result.current.selectors.getAllFileIds()).toEqual([id]);
      expect(result.current.selectors.getFile(output.fileId)).toBeUndefined();
      if (decision === "cancel") {
        await act(async () => {
          fireEvent.click(screen.getByText("Cancel opening"));
          await consuming;
        });
        expect(result.current.selectors.getAllFileIds()).toEqual([id]);
        await expect(consuming).resolves.toEqual([]);
        return;
      }
      localInspection.mockResolvedValueOnce({
        data: {
          encrypted: true,
          signed: false,
          ownerAuthenticated: true,
          permissions: -4,
          pageCount: 1,
        },
      });
      fireEvent.change(screen.getByLabelText("PDF password"), {
        target: { value: "secret" },
      });
      await act(async () => {
        fireEvent.click(screen.getByText("Unlock"));
        await consuming;
      });
      const accepted = await consuming;
      expect(accepted).toHaveLength(1);
      expect(result.current.selectors.getAllFileIds()).toEqual(accepted);
      expect(
        result.current.selectors.getStirlingFileStub(accepted[0]),
      ).toMatchObject({
        derivedFromTool: true,
        sourceFileIds: [id],
        processedFile: { isEncrypted: true },
      });
    },
  );

  it.each(["cancel", "clear"])(
    "handles %s after part of a protected batch is admitted",
    async (decision) => {
      const { result } = renderHook(
        () => ({ ...useFileActions(), selectors: useFileSelectors() }),
        { wrapper },
      );
      await act(() =>
        result.current.actions.addFiles([new File(["original"], "source.pdf")]),
      );
      const outputs = ["first", "second"].map((name) =>
        createStirlingFile(new File(["encrypted"], `${name}.pdf`)),
      );
      const stubs = outputs.map((file) =>
        createNewStirlingFileStub(file, file.fileId, undefined, {
          pages: [],
          isEncrypted: true,
          requiresOpeningPassword: true,
        }),
      );
      let consuming!: ReturnType<typeof result.current.actions.consumeFiles>;
      await act(async () => {
        consuming = result.current.actions.consumeFiles([id], outputs, stubs);
      });
      localInspection.mockResolvedValueOnce({
        data: {
          encrypted: true,
          signed: false,
          ownerAuthenticated: true,
          permissions: -4,
          pageCount: 1,
        },
      });
      fireEvent.change(screen.getByLabelText("PDF password"), {
        target: { value: "secret" },
      });
      await act(async () => {
        fireEvent.click(screen.getByText("Unlock"));
      });
      expect(result.current.selectors.getAllFileIds()).toEqual([id]);
      if (decision === "clear") {
        await act(async () => {
          await result.current.actions.clearAllFiles();
          await consuming;
        });
        expect(result.current.selectors.getAllFileIds()).toEqual([]);
        await expect(consuming).resolves.toEqual([]);
        return;
      }
      await act(async () => {
        fireEvent.click(screen.getByText("Cancel opening"));
        await consuming;
      });
      expect(result.current.selectors.getAllFileIds()).toEqual(
        expect.arrayContaining([id, outputs[0].fileId]),
      );
      expect(
        result.current.selectors.getStirlingFileStub(outputs[0].fileId)
          ?.sourceFileIds,
      ).toEqual([id]);
      await expect(consuming).resolves.toEqual([outputs[0].fileId]);
    },
  );
});
afterEach(() => {
  cleanup();
  setPendingUnlocks([]);
});

describe("encrypted bytes opened by another editor", () => {
  it.each([false, true])(
    "requires owner authentication without cached access, cancelled: %s",
    async (cancelled) => {
      observed.isEncrypted = false;
      const { result } = renderHook(
        () => ({ ...useFileActions(), selectors: useFileSelectors() }),
        { wrapper },
      );
      await act(() =>
        result.current.actions.addFiles([new File(["original"], "locked.pdf")]),
      );
      let permitted!: Promise<boolean>;
      act(() => {
        permitted = result.current.actions.requestPdfOwnerAccess(
          id,
          "Change permissions",
        );
      });
      if (cancelled) {
        await act(async () =>
          fireEvent.click(screen.getByText("Cancel opening")),
        );
        await expect(permitted).resolves.toBe(false);
        expect(result.current.selectors.getAllFileIds()).toEqual([id]);
        expect(getPdfAccess(id)).toBeUndefined();
        return;
      }
      localInspection.mockResolvedValueOnce({
        data: {
          encrypted: true,
          signed: false,
          ownerAuthenticated: false,
          permissions: 0,
          pageCount: 1,
        },
      });
      fireEvent.change(screen.getByLabelText("Permissions password"), {
        target: { value: "reader" },
      });
      await act(async () => fireEvent.click(screen.getByText("Unlock")));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "encryptedPdfUnlock.ownerRequired",
      );
      expect(getPdfAccess(id)).toBeUndefined();
      localInspection.mockResolvedValueOnce({
        data: {
          encrypted: true,
          signed: false,
          ownerAuthenticated: true,
          permissions: 0,
          pageCount: 1,
        },
      });
      fireEvent.change(screen.getByLabelText("Permissions password"), {
        target: { value: "owner" },
      });
      await act(async () => fireEvent.click(screen.getByText("Unlock")));
      await expect(permitted).resolves.toBe(true);
      expect(getPdfAccess(id)?.password).toBe("owner");
    },
  );

  it.each([false, true])(
    "removes the opening password while retaining owner protection: %s",
    async (hasOwnerPassword) => {
      const persist = vi
        .spyOn(fileStorage, "persistVersionedOutputs")
        .mockResolvedValue();
      const { result } = renderHook(
        () => ({ ...useFileActions(), selectors: useFileSelectors() }),
        { wrapper },
      );
      const original = new File(["encrypted original"], "locked.pdf");
      let loading!: ReturnType<typeof result.current.actions.addFiles>;
      await act(async () => {
        loading = result.current.actions.addFiles([original]);
      });
      const security = {
        encrypted: true,
        signed: false,
        openingAuthenticated: true,
        ownerAuthenticated: !hasOwnerPassword,
        requiresOpeningPassword: true,
        permissions: hasOwnerPassword ? 0 : -4,
        pageCount: 1,
      };
      const post = vi.mocked(apiClient.post);
      post.mockReset();
      localInspection.mockResolvedValueOnce({ data: security });
      if (hasOwnerPassword) {
        fireEvent.change(screen.getByLabelText("PDF password"), {
          target: { value: "reader" },
        });
        await act(async () => {
          fireEvent.click(screen.getByText("Remove Password"));
        });
        expect(screen.getByLabelText("Permissions password")).toBeVisible();
        expect(post).not.toHaveBeenCalled();
        expect(getPdfAccess(original)).toBeUndefined();
        expect(result.current.selectors.getAllFileIds()).toEqual([]);
        localInspection.mockResolvedValueOnce({
          data: {
            ...security,
            openingAuthenticated: false,
            ownerAuthenticated: true,
          },
        });
      }
      post.mockResolvedValueOnce({ data: new Blob(["password removed"]) });
      localInspection.mockResolvedValueOnce({
        data: {
          ...security,
          encrypted: hasOwnerPassword,
          openingAuthenticated: true,
          ownerAuthenticated: false,
          requiresOpeningPassword: false,
        },
      });
      fireEvent.change(
        screen.getByLabelText(
          hasOwnerPassword ? "Permissions password" : "PDF password",
        ),
        {
          target: { value: hasOwnerPassword ? "owner" : "reader" },
        },
      );
      await act(async () => {
        fireEvent.click(
          screen.getByText(hasOwnerPassword ? "Unlock" : "Remove Password"),
        );
        await loading;
      });
      const [copy] = await loading;
      expect(copy.name).toBe("locked_password_removed.pdf");
      expect(getPdfAccess(copy)).toMatchObject({
        encrypted: hasOwnerPassword,
        ownerAuthenticated: false,
        password: "",
        permissions: security.permissions,
      });
      const request = post.mock.calls.find(
        ([url]) => url === "/api/v1/security/remove-password",
      )!;
      const form = request[1] as FormData;
      expect(form.get("password")).toBe("reader");
      expect(form.get("sourcePassword")).toBe(
        hasOwnerPassword ? "owner" : "reader",
      );
      expect(form.has("ownerPassword")).toBe(false);
      expect(result.current.selectors.getAllFileIds()).toEqual([copy.fileId]);
      expect(isAwaitingUnlock(id)).toBe(false);
      expect(persist).toHaveBeenCalledWith([id], [copy], expect.any(Array));
      expect(original.size).toBe("encrypted original".length);
      persist.mockRestore();
    },
  );

  it("does not admit or remove a pending PDF when permissions verification is cancelled", async () => {
    const { result } = renderHook(
      () => ({ ...useFileActions(), selectors: useFileSelectors() }),
      { wrapper },
    );
    let loading!: ReturnType<typeof result.current.actions.addFiles>;
    await act(async () => {
      loading = result.current.actions.addFiles([
        new File(["encrypted"], "locked.pdf"),
      ]);
    });
    const security = {
      encrypted: true,
      signed: false,
      openingAuthenticated: true,
      ownerAuthenticated: false,
      requiresOpeningPassword: true,
      permissions: 0,
      pageCount: 1,
      honorOwnerPasswords: false,
    };
    const post = vi.mocked(apiClient.post);
    post.mockReset();
    localInspection.mockResolvedValueOnce({ data: security });
    fireEvent.change(screen.getByLabelText("PDF password"), {
      target: { value: "reader" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Remove Password"));
    });
    localInspection.mockResolvedValueOnce({ data: security });
    fireEvent.change(screen.getByLabelText("Permissions password"), {
      target: { value: "reader" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Unlock"));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "encryptedPdfUnlock.ownerRequired",
    );
    expect(post).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByText("Cancel opening"));
      await loading;
    });
    await expect(loading).resolves.toEqual([]);
    expect(getPdfAccess(id)).toBeUndefined();
    expect(result.current.selectors.getAllFileIds()).toEqual([]);
    expect(isAwaitingUnlock(id)).toBe(false);
  });

  it("creates an unprotected version only from verified owner access", async () => {
    observed.isEncrypted = false;
    const persist = vi
      .spyOn(fileStorage, "persistVersionedOutputs")
      .mockResolvedValue();
    const { result } = renderHook(
      () => ({ ...useFileActions(), selectors: useFileSelectors() }),
      { wrapper },
    );
    await act(async () => {
      await result.current.actions.addFiles([
        new File(["original"], "locked.pdf"),
      ]);
    });
    const file = result.current.selectors.getFile(id)!;
    await expect(
      result.current.actions.createUnprotectedCopy(file.fileId),
    ).rejects.toThrow("encryptedPdfUnlock.ownerRequired");
    rememberPdfAccess(file, {
      password: "owner",
      encrypted: true,
      signed: false,
      ownerAuthenticated: true,
      permissions: 0,
      pageCount: 1,
    });
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: new Blob(["unprotected"]),
    });
    localInspection.mockResolvedValueOnce({
      data: {
        encrypted: false,
        signed: false,
        ownerAuthenticated: false,
        permissions: -4,
        pageCount: 1,
      },
    });
    await act(async () =>
      result.current.actions.createUnprotectedCopy(file.fileId),
    );
    const copy = result.current.selectors.getFiles(
      result.current.selectors.getAllFileIds(),
    )[0];
    expect(copy.name).toBe("locked_unprotected.pdf");
    expect(getPdfAccess(copy)?.encrypted).toBe(false);
    expect(persist).toHaveBeenCalledWith(
      [file.fileId],
      [copy],
      [expect.objectContaining({ parentFileId: file.fileId })],
    );
    expect(file.size).toBe("original".length);
    persist.mockRestore();
  });

  it("settles an action's permission request when cancelled or the file is closed", async () => {
    observed.isEncrypted = false;
    const { result } = renderHook(
      () => ({ ...useFileActions(), selectors: useFileSelectors() }),
      { wrapper },
    );
    await act(async () => {
      await result.current.actions.addFiles([
        new File(["original"], "locked.pdf"),
      ]);
    });
    const file = result.current.selectors.getFile(id)!;
    rememberPdfAccess(file, {
      password: "",
      encrypted: true,
      signed: false,
      ownerAuthenticated: false,
      permissions: 0,
      pageCount: 1,
    });
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.actions.requestPdfOwnerAccess(
        file.fileId,
        "Compress",
      );
    });
    await act(async () => fireEvent.click(screen.getByText("Cancel opening")));
    await expect(pending).resolves.toBe(false);
    expect(result.current.selectors.getFile(file.fileId)).toBe(file);
    act(() => {
      pending = result.current.actions.requestPdfOwnerAccess(
        file.fileId,
        "Compress",
      );
    });
    await act(async () =>
      result.current.actions.removeFiles([file.fileId], false),
    );
    await expect(pending).resolves.toBe(false);
  });
  it("cancelling while persistence finishes does not return a file to the caller", async () => {
    let finishWrite!: () => void;
    observed.afterDispatch = () =>
      new Promise<void>((resolve) => {
        finishWrite = resolve;
      });
    const { result } = renderHook(
      () => ({ ...useFileActions(), selectors: useFileSelectors() }),
      { wrapper },
    );
    let loading!: ReturnType<typeof result.current.actions.addFiles>;
    await act(async () => {
      loading = result.current.actions.addFiles([
        new File(["encrypted"], "locked.pdf"),
      ]);
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Cancel opening"));
    });
    await act(async () => {
      finishWrite();
      await loading;
    });
    await expect(loading).resolves.toEqual([]);
    expect(result.current.selectors.getAllFileIds()).toEqual([]);
  });
  it("unlocks the original in place without adding a password-removal version", async () => {
    localInspection.mockResolvedValueOnce({
      data: {
        encrypted: true,
        signed: false,
        ownerAuthenticated: true,
        permissions: -4,
        pageCount: 1,
      },
    });
    const { result } = renderHook(
      () => ({ ...useFileActions(), selectors: useFileSelectors() }),
      { wrapper },
    );
    const original = new File(["encrypted original"], "locked.pdf");
    let loading!: ReturnType<typeof result.current.actions.addFiles>;
    await act(async () => {
      loading = result.current.actions.addFiles([original]);
    });
    expect(result.current.selectors.getAllFileIds()).toEqual([]);
    expect(result.current.selectors.getFile(id)).toBeUndefined();
    expect(result.current.selectors.getFiles([id])).toEqual([]);
    fireEvent.change(screen.getByLabelText("PDF password"), {
      target: { value: " secret " },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Unlock"));
    });
    await expect(loading).resolves.toEqual([original]);
    expect(result.current.selectors.getFile(id)).toBe(original);
    expect(result.current.selectors.getStirlingFileStub(id)).toMatchObject({
      id,
      versionNumber: 1,
      isLeaf: true,
      processedFile: { isEncrypted: true },
    });
    expect(getPdfAccess(id)?.password).toBe(" secret ");
    expect(isAwaitingUnlock(id)).toBe(false);
    expect(apiClient.post).not.toHaveBeenCalled();
    await act(() => result.current.actions.removeFiles([id]));
    expect(getPdfAccess(original)).toBeUndefined();
  });

  it("cancel keeps protected bytes out of context and settles the loading action", async () => {
    const { result } = renderHook(
      () => ({ ...useFileActions(), selectors: useFileSelectors() }),
      { wrapper },
    );
    let loading!: ReturnType<typeof result.current.actions.addFiles>;
    await act(async () => {
      loading = result.current.actions.addFiles([
        new File(["encrypted"], "locked.pdf"),
      ]);
    });
    expect(observed.heldBeforeEffects).toBe(true);
    expect(isAwaitingUnlock(id)).toBe(true);
    expect(screen.getByText("Cancel opening")).toBeVisible();
    await act(async () => {
      fireEvent.click(screen.getByText("Cancel opening"));
    });
    await expect(loading).resolves.toEqual([]);
    expect(result.current.selectors.getAllFileIds()).toEqual([]);
    expect(result.current.selectors.getFile(id)).toBeUndefined();
    expect(isAwaitingUnlock(id)).toBe(false);
  });

  it("clearing the workspace cancels pending admissions", async () => {
    const { result } = renderHook(() => useFileActions(), { wrapper });
    let loading!: ReturnType<typeof result.current.actions.addFiles>;
    await act(async () => {
      loading = result.current.actions.addFiles([
        new File(["encrypted"], "locked.pdf"),
      ]);
    });
    expect(isAwaitingUnlock(id)).toBe(true);
    await act(async () => {
      await result.current.actions.clearAllFiles();
    });
    expect(isAwaitingUnlock(id)).toBe(false);
    await expect(loading).resolves.toEqual([]);
  });

  it("a rejected password leaves the file pending until cancelled", async () => {
    localInspection.mockRejectedValueOnce(new Error("bad password"));
    const { result } = renderHook(
      () => ({ ...useFileActions(), selectors: useFileSelectors() }),
      { wrapper },
    );
    let loading!: ReturnType<typeof result.current.actions.addFiles>;
    await act(async () => {
      loading = result.current.actions.addFiles([
        new File(["encrypted"], "locked.pdf"),
      ]);
    });
    fireEvent.change(screen.getByLabelText("PDF password"), {
      target: { value: "wrong" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Unlock"));
    });
    await waitFor(() =>
      expect(screen.getByText("Cancel opening")).toBeVisible(),
    );
    expect(result.current.selectors.getAllFileIds()).toEqual([]);
    expect(getPdfAccess(id)).toBeUndefined();
    await act(async () => {
      fireEvent.click(screen.getByText("Cancel opening"));
    });
    await expect(loading).resolves.toEqual([]);
  });
});

describe("preview session credentials", () => {
  const previewSecurity = {
    encrypted: true,
    signed: false,
    ownerAuthenticated: false,
    permissions: 0,
    pageCount: 1,
  };
  afterEach(cleanup);

  it("unlocks without publishing or persisting a file, then forgets access on close", async () => {
    localInspection.mockResolvedValueOnce({ data: previewSecurity });
    const { result } = renderHook(
      () => ({ ...useFileActions(), selectors: useFileSelectors() }),
      { wrapper },
    );
    const preview = new File(["protected"], "preview.pdf");
    const lifetime = new AbortController();
    await act(() =>
      result.current.actions.unlockPreviewPdf(
        preview,
        " secret ",
        lifetime.signal,
      ),
    );
    expect(getPdfAccess(preview)).toEqual({
      ...previewSecurity,
      password: " secret ",
      openingPassword: " secret ",
    });
    expect(result.current.selectors.getAllFileIds()).toEqual([]);
    expect(result.current.selectors.getFiles()).toEqual([]);
    act(() => lifetime.abort());
    expect(getPdfAccess(preview)).toBeUndefined();
  });

  it("does not retain a password when authentication finishes after the preview closes", async () => {
    let finish!: (response: { data: typeof previewSecurity }) => void;
    localInspection.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(useFileActions, { wrapper });
    const preview = new File(["protected"], "preview.pdf");
    const lifetime = new AbortController();
    const unlocking = result.current.actions.unlockPreviewPdf(
      preview,
      "secret",
      lifetime.signal,
    );
    lifetime.abort();
    await act(async () => {
      finish({ data: previewSecurity });
      await unlocking;
    });
    expect(getPdfAccess(preview)).toBeUndefined();
  });
});

it("preserves a preview credential after its bytes are admitted to FileContext", async () => {
  localInspection.mockResolvedValueOnce({
    data: {
      encrypted: true,
      signed: false,
      ownerAuthenticated: true,
      permissions: -4,
      pageCount: 1,
    },
  });
  const { result } = renderHook(useFileActions, { wrapper });
  const preview = new File(["protected"], "preview.pdf");
  const lifetime = new AbortController();
  await act(() =>
    result.current.actions.unlockPreviewPdf(preview, "secret", lifetime.signal),
  );
  const admitted = createStirlingFile(preview, id);
  bindPdfAccess(admitted, id);
  act(() => lifetime.abort());
  expect(getPdfAccess(id)?.password).toBe("secret");
});
