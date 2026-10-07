import type { ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FileContextProvider,
  useFileActions,
  useFileSelectors,
} from "@app/contexts/FileContext";
import apiClient from "@app/services/apiClient";
import { getPdfAccess } from "@app/services/pdfPasswordStore";
import {
  createStirlingFile,
  type FileId,
  type StirlingFileStub,
} from "@app/types/fileContext";
import {
  isAwaitingUnlock,
  setPendingUnlocks,
} from "@app/services/pendingUnlocks";

const observed = vi.hoisted(() => ({ heldBeforeEffects: false }));
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
    onPasswordChange,
  }: {
    opened: boolean;
    onSkip: () => void;
    onUnlock: () => void;
    onPasswordChange: (password: string) => void;
  }) =>
    opened ? (
      <>
        <button onClick={onSkip}>Skip unlock</button>
        <input
          aria-label="PDF password"
          onChange={(event) => onPasswordChange(event.target.value)}
        />
        <button onClick={onUnlock}>Unlock</button>
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
          processedFile: { pages: [], isEncrypted: true },
        };
        filesRef.current.set(id, file);
        dispatch({ type: "ADD_FILES", payload: { stirlingFileStubs: [stub] } });
        observed.heldBeforeEffects = isAwaitingUnlock(id);
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
  observed.heldBeforeEffects = false;
  setPendingUnlocks([]);
});
afterEach(() => {
  cleanup();
  setPendingUnlocks([]);
});

describe("encrypted bytes opened by another editor", () => {
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
    await act(() => result.current.actions.addFiles([original]));
    fireEvent.change(screen.getByLabelText("PDF password"), {
      target: { value: " secret " },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Unlock"));
    });
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

  it("holds policies before dispatch without opening a duplicate password modal", async () => {
    const { result } = renderHook(() => useFileActions(), { wrapper });
    await act(() =>
      result.current.actions.addFiles([new File(["encrypted"], "locked.pdf")], {
        selectFiles: false,
        skipAutomaticPasswordPrompt: true,
      }),
    );
    expect(observed.heldBeforeEffects).toBe(true);
    expect(isAwaitingUnlock(id)).toBe(true);
    expect(screen.queryByText("Skip unlock")).toBeNull();

    act(() => result.current.actions.openEncryptedUnlockPrompt(id));
    expect(screen.getByText("Skip unlock")).toBeVisible();
    expect(isAwaitingUnlock(id)).toBe(true);
    fireEvent.click(screen.getByText("Skip unlock"));
    expect(isAwaitingUnlock(id)).toBe(false);
  });

  it.each(["decrypt", "remove"])(
    "releases the hold after %s",
    async (action) => {
      const { result } = renderHook(() => useFileActions(), { wrapper });
      await act(() =>
        result.current.actions.addFiles(
          [new File(["encrypted"], "locked.pdf")],
          {
            selectFiles: false,
            skipAutomaticPasswordPrompt: true,
          },
        ),
      );
      expect(isAwaitingUnlock(id)).toBe(true);
      await act(async () => {
        if (action === "decrypt") {
          result.current.actions.updateStirlingFileStub(id, {
            processedFile: { pages: [], isEncrypted: false },
          });
        } else {
          await result.current.actions.clearAllFiles();
        }
      });
      expect(isAwaitingUnlock(id)).toBe(false);
    },
  );
});
