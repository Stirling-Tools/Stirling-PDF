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
} from "@app/contexts/FileContext";
import apiClient from "@app/services/apiClient";
import {
  getPdfAccess,
  rememberPdfAccess,
  bindPdfAccess,
} from "@app/services/pdfPasswordStore";

import { fileStorage } from "@app/services/fileStorage";
import { generateProcessedFileMetadata } from "@app/contexts/file/fileActions";
import {
  createStirlingFile,
  createNewStirlingFileStub,
  type FileId,
  type StirlingFileStub,
} from "@app/types/fileContext";
import {
  isAwaitingUnlock,
  setPendingUnlocks,
} from "@app/services/pendingUnlocks";

const observed = vi.hoisted(() => ({
  isEncrypted: true,
  heldBeforeEffects: false,
  afterDispatch: undefined as (() => Promise<void>) | undefined,
}));
const id = "editor-encrypted" as FileId;

vi.mock("@app/services/apiClient", () => ({ default: { post: vi.fn() } }));

vi.mock("@app/contexts/IndexedDBContext", () => ({
  useIndexedDB: () => null,
}));
vi.mock("@app/hooks/tools/shared/useResolutionContinuation", () => ({
  useResolutionContinuation: () => vi.fn(),
}));
vi.mock("@app/hooks/useZipConfirmation", () => ({
  useZipConfirmation: () => ({
    confirmationState: { opened: false },
    requestConfirmation: vi.fn(),
    handleConfirm: vi.fn(),
    handleCancel: vi.fn(),
  }),
}));
vi.mock("@app/components/shared/ZipWarningModal", () => ({
  default: () => null,
}));
vi.mock("@app/components/shared/EncryptedPdfUnlockModal", () => ({
  default: ({
    opened,
    onSkip,
    onUnlock,
    onRemovePassword,
    ownerUnlock,
    errorMessage,
    password,
    onPasswordChange,
  }: {
    opened: boolean;
    onSkip: () => void;
    onUnlock: () => void;
    onRemovePassword?: () => void;
    ownerUnlock?: boolean;
    errorMessage?: string | null;
    password: string;
    onPasswordChange: (password: string) => void;
  }) =>
    opened ? (
      <>
        <button onClick={onSkip}>Cancel opening</button>
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
    ) : null,
}));
vi.mock("@app/contexts/file/fileActions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/contexts/file/fileActions")>();
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
          processedFile: { pages: [], isEncrypted: observed.isEncrypted },
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
  vi.mocked(generateProcessedFileMetadata).mockResolvedValue({
    pages: [],
    totalPages: 1,
    isEncrypted: false,
  });
  observed.isEncrypted = true;
  observed.heldBeforeEffects = false;
  observed.afterDispatch = undefined;
  setPendingUnlocks([]);
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
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: {
          encrypted: true,
          signed: false,
          ownerAuthenticated: true,
          permissions: -4,
          canModify: true,
          canAssemble: true,
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
        }),
      );
      let consuming!: ReturnType<typeof result.current.actions.consumeFiles>;
      await act(async () => {
        consuming = result.current.actions.consumeFiles([id], outputs, stubs);
      });
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: {
          encrypted: true,
          signed: false,
          ownerAuthenticated: true,
          permissions: -4,
          canModify: true,
          canAssemble: true,
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
        hasOwnerPassword,
        permissions: hasOwnerPassword ? 0 : -4,
        canModify: !hasOwnerPassword,
        canAssemble: !hasOwnerPassword,
        pageCount: 1,
      };
      const post = vi.mocked(apiClient.post);
      post.mockReset();
      post.mockResolvedValueOnce({ data: security });
      if (hasOwnerPassword) {
        fireEvent.change(screen.getByLabelText("PDF password"), {
          target: { value: "reader" },
        });
        await act(async () => {
          fireEvent.click(screen.getByText("Remove Password"));
        });
        expect(screen.getByLabelText("Permissions password")).toBeVisible();
        expect(post).toHaveBeenCalledTimes(1);
        expect(getPdfAccess(original)).toBeUndefined();
        expect(result.current.selectors.getAllFileIds()).toEqual([]);
        post.mockResolvedValueOnce({
          data: {
            ...security,
            openingAuthenticated: false,
            ownerAuthenticated: true,
          },
        });
      }
      post.mockResolvedValueOnce({ data: new Blob(["password removed"]) });
      post.mockResolvedValueOnce({
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
        { target: { value: hasOwnerPassword ? "owner" : "reader" } },
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
        ([url]) => url === "/api/v1/security/remove-pdf-passwords",
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
      hasOwnerPassword: true,
      permissions: 0,
      canModify: false,
      canAssemble: false,
      pageCount: 1,
      honorOwnerPasswords: false,
    };
    const post = vi.mocked(apiClient.post);
    post.mockReset();
    post.mockResolvedValueOnce({ data: security });
    fireEvent.change(screen.getByLabelText("PDF password"), {
      target: { value: "reader" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Remove Password"));
    });
    post.mockResolvedValueOnce({ data: security });
    fireEvent.change(screen.getByLabelText("Permissions password"), {
      target: { value: "reader" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Unlock"));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "encryptedPdfUnlock.ownerRequired",
    );
    expect(
      post.mock.calls.every(
        ([url]) => url === "/api/v1/security/inspect-pdf-security",
      ),
    ).toBe(true);
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
      canModify: true,
      canAssemble: true,
      pageCount: 1,
    });
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: new Blob(["unprotected"]) })
      .mockResolvedValueOnce({
        data: {
          encrypted: false,
          signed: false,
          ownerAuthenticated: false,
          permissions: -4,
          canModify: true,
          canAssemble: true,
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
      canModify: false,
      canAssemble: false,
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
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        encrypted: true,
        signed: false,
        ownerAuthenticated: true,
        permissions: -4,
        canModify: true,
        canAssemble: true,
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
    expect(vi.mocked(apiClient.post).mock.calls.at(-1)?.[0]).toBe(
      "/api/v1/security/inspect-pdf-security",
    );
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
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error("bad password"));
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
    canModify: false,
    canAssemble: false,
    pageCount: 1,
  };
  afterEach(cleanup);

  it("unlocks without publishing or persisting a file, then forgets access on close", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: previewSecurity });
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
    vi.mocked(apiClient.post).mockReturnValueOnce(
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
  vi.mocked(apiClient.post).mockResolvedValueOnce({
    data: {
      encrypted: true,
      signed: false,
      ownerAuthenticated: true,
      permissions: -4,
      canModify: true,
      canAssemble: true,
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
