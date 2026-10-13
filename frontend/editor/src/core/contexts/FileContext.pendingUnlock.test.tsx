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
import { getPdfAccess } from "@app/services/pdfPasswordStore";
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
    onPasswordChange,
  }: {
    opened: boolean;
    onSkip: () => void;
    onUnlock: () => void;
    onRemovePassword: () => void;
    onPasswordChange: (password: string) => void;
  }) =>
    opened ? (
      <>
        <button onClick={onSkip}>Cancel opening</button>
        <input
          aria-label="PDF password"
          onChange={(event) => onPasswordChange(event.target.value)}
        />
        <button onClick={onUnlock}>Unlock</button>
        <button onClick={onRemovePassword}>Remove Password</button>
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

  it.each(["cancel", "unlock", "remove-password"])(
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
        data:
          decision === "remove-password"
            ? new Blob(["plain"])
            : {
                encrypted: true,
                signed: false,
                ownerAuthenticated: true,
                permissions: -4,
                canModify: true,
                canAssemble: true,
                pageCount: 1,
              },
      });
      if (decision === "remove-password")
        vi.mocked(apiClient.post).mockResolvedValueOnce({
          data: {
            encrypted: true,
            signed: false,
            ownerAuthenticated: false,
            permissions: -8,
            canModify: true,
            canAssemble: true,
            pageCount: 1,
          },
        });
      fireEvent.change(screen.getByLabelText("PDF password"), {
        target: { value: "secret" },
      });
      await act(async () => {
        fireEvent.click(
          screen.getByText(
            decision === "unlock" ? "Unlock" : "Remove Password",
          ),
        );
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
  it("returns a restricted copy with no opening password and preserves the original", async () => {
    const persist = vi
      .spyOn(fileStorage, "persistVersionedOutputs")
      .mockResolvedValue();
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({
        data: new Blob(["restricted output"]),
      })
      .mockResolvedValueOnce({
        data: {
          encrypted: true,
          signed: false,
          ownerAuthenticated: false,
          permissions: -8,
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
    fireEvent.change(screen.getByLabelText("PDF password"), {
      target: { value: "secret" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Remove Password"));
    });
    const [copy] = await loading;
    expect(copy.name).toBe("locked_opening_password_removed.pdf");
    expect(copy.fileId).not.toBe(id);
    expect(result.current.selectors.getAllFileIds()).toEqual([copy.fileId]);
    expect(
      result.current.selectors.getStirlingFileStub(copy.fileId),
    ).toMatchObject({
      parentFileId: id,
      versionNumber: 2,
      toolHistory: [{ toolId: "removePassword" }],
    });
    expect(persist).toHaveBeenCalledWith(
      [id],
      [copy],
      [expect.objectContaining({ parentFileId: id })],
    );
    expect(original.name).toBe("locked.pdf");
    expect(original.size).toBe("encrypted original".length);
    expect(getPdfAccess(copy)).toMatchObject({
      encrypted: true,
      password: "",
      ownerAuthenticated: false,
    });
    expect(getPdfAccess(original)).toBeUndefined();
    expect(isAwaitingUnlock(id)).toBe(false);
    const [endpoint, form] = vi
      .mocked(apiClient.post)
      .mock.calls.find(
        ([path]) => path === "/api/v1/security/remove-pdf-opening-password",
      )!;
    expect(endpoint).toBe("/api/v1/security/remove-pdf-opening-password");
    expect((form as FormData).get("password")).toBe("secret");
    persist.mockRestore();
  });

  it("keeps a failed password removal pending without creating an output", async () => {
    const persist = vi
      .spyOn(fileStorage, "persistVersionedOutputs")
      .mockResolvedValue();
    vi.mocked(apiClient.post).mockRejectedValueOnce(
      new Error("Incorrect password"),
    );
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
      fireEvent.click(screen.getByText("Remove Password"));
    });
    expect(result.current.selectors.getAllFileIds()).toEqual([]);
    expect(isAwaitingUnlock(id)).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByText("Cancel opening"));
    });
    await expect(loading).resolves.toEqual([]);
    persist.mockRestore();
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
