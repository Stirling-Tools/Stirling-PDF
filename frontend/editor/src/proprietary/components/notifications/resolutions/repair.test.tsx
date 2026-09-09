import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  bytesOf,
  context,
  inProcessor,
  policyContext,
} from "@app/components/notifications/resolutions/testSupport";

// Where each action sends the reader. Only the editor has the workbench contexts above it.

const retryWithPassword = vi.fn();
const unlockLocalDocument = vi.fn();
const repairDocuments = vi.fn();
const retryWithFiles = vi.fn();
vi.mock("@app/services/notificationRetry", async (importOriginal) => ({
  // The real stashMatchesKind and retryInputIds: both are pure, and their guards are part of
  // what these tests exercise.
  ...(await importOriginal<typeof import("@app/services/notificationRetry")>()),
  retryWithPassword: (...args: unknown[]) => retryWithPassword(...args),
  unlockLocalDocument: (...args: unknown[]) => unlockLocalDocument(...args),
  repairDocuments: (...args: unknown[]) => repairDocuments(...args),
  retryWithFiles: (...args: unknown[]) => retryWithFiles(...args),
}));

const rerunPolicy = vi.fn();
const rechainPolicyOnDocument = vi.fn();
vi.mock("@app/services/notificationPolicyRetry", () => ({
  rerunPolicy: (...args: unknown[]) => rerunPolicy(...args),
  rechainPolicyOnDocument: (...args: unknown[]) =>
    rechainPolicyOnDocument(...args),
}));

const reportNotificationResolved = vi.fn();
vi.mock("@app/services/notifications", async () => ({
  ...(await vi.importActual<typeof import("@app/services/notifications")>(
    "@app/services/notifications",
  )),
  reportNotificationResolved: (...args: unknown[]) =>
    reportNotificationResolved(...args),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  )),
  useNavigate: () => navigate,
}));

// No i18n instance here, and the plugin is stubbed because the contexts below reach `core/i18n`.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// IndexedDB, which jsdom has none of. Answered here so presence is a fact of the test.
const h = vi.hoisted(() => ({
  stub: { id: "f-1" } as unknown,
  getStirlingFileStub: vi.fn(),
}));

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFileStub: (fileId: string) => h.getStirlingFileStub(fileId),
  },
}));

const { FileActionsContext, FileStoreContext } =
  await import("@app/contexts/file/contexts");
const { NavigationActionsContext } =
  await import("@app/contexts/NavigationContext");
const { ViewerContext } = await import("@app/contexts/ViewerContext");
const { useNotificationActions } =
  await import("@app/components/notifications/notificationActions");

const addStirlingFileStubs = vi.fn();
const setActiveFileId = vi.fn();
const setWorkbench = vi.fn();
const setToolAndWorkbench = vi.fn();
// createChildStub is stubbed too, so the test can name the version's id directly.
vi.mock("@app/contexts/file/fileActions", () => ({
  generateProcessedFileMetadata: () => Promise.resolve(null),
  createChildStub: (parent: { id: string }, _op: unknown, file: File) => ({
    ...parent,
    id: "f-unlocked",
    name: file.name,
    versionNumber: 2,
    parentFileId: parent.id,
  }),
}));

/** What the workbench already holds, so the "do not add it twice" path can be exercised. */
let openFileIds: string[] = [];
/** Stubs the workbench holds, so the in-place replacement path has an original to version. */
let openFilesById: Record<string, unknown> = {};
const setSelectedFiles = vi.fn();
const addFiles = vi.fn();
const consumeFiles = vi.fn();

/** The editor shell: the workbench's providers all sit above the bell. */
const inEditor = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <FileActionsContext.Provider
      value={{
        actions: {
          addStirlingFileStubs,
          setSelectedFiles,
          addFiles,
          consumeFiles,
        } as never,
        dispatch: vi.fn(),
      }}
    >
      <FileStoreContext.Provider
        value={
          {
            getState: () => ({
              files: { ids: openFileIds, byId: openFilesById },
            }),
            subscribe: () => () => {},
            selectors: {},
          } as never
        }
      >
        <NavigationActionsContext.Provider
          value={{ actions: { setWorkbench, setToolAndWorkbench } } as never}
        >
          <ViewerContext.Provider value={{ setActiveFileId } as never}>
            {children}
          </ViewerContext.Provider>
        </NavigationActionsContext.Provider>
      </FileStoreContext.Provider>
    </FileActionsContext.Provider>
  </MemoryRouter>
);

function registry(wrapper = inEditor) {
  return renderHook(() => useNotificationActions(), { wrapper }).result.current;
}

beforeEach(() => {
  navigate.mockReset();
  addStirlingFileStubs.mockReset().mockResolvedValue([]);
  setActiveFileId.mockReset();
  setWorkbench.mockReset();
  setToolAndWorkbench.mockReset();
  h.getStirlingFileStub.mockReset().mockResolvedValue(h.stub);
  openFileIds = [];
  openFilesById = {};
  setSelectedFiles.mockReset();
  consumeFiles.mockReset().mockResolvedValue(["f-unlocked"]);
  // The adopted document's own id, not the reference the failure was filed against.
  addFiles.mockReset().mockResolvedValue([{ fileId: "f-unlocked" }]);
  reportNotificationResolved.mockReset().mockResolvedValue(true);
  retryWithPassword.mockReset().mockResolvedValue({ ok: true, files: [] });
  // The unlock succeeds by default: most cases below are about what happens afterwards.
  unlockLocalDocument.mockReset().mockResolvedValue({
    ok: true,
    files: [
      {
        blob: new Blob(["pdf"], { type: "application/pdf" }),
        filename: "invoice.pdf",
      },
    ],
  });
  // The repair succeeds by default: most cases below are about what happens afterwards.
  repairDocuments.mockReset().mockResolvedValue({
    ok: true,
    repaired: [
      {
        fileId: "f-1",
        file: {
          blob: new Blob(["repaired"], { type: "application/pdf" }),
          filename: "invoice_repaired.pdf",
        },
      },
    ],
  });
  retryWithFiles.mockReset().mockResolvedValue({ ok: true, files: [] });
  // Tracked by default: something is polling the run, so its output will arrive.
  rerunPolicy.mockReset().mockResolvedValue({ ok: true, tracked: true });
  rechainPolicyOnDocument.mockReset().mockResolvedValue({
    ok: true,
    tracked: true,
  });
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/");
});

/** Repair is decrypt's shape without the password: fix the input, then re-run what failed. */
describe("REPAIR", () => {
  it("repairs the document, then re-runs the policy that failed on it", async () => {
    const outcome = await registry().REPAIR?.run(
      policyContext({ kindId: "INPUT_CORRUPTED" }),
    );

    expect(repairDocuments).toHaveBeenCalledWith(["f-1"]);
    // The re-run, not the repair, is what resolves the row.
    expect(rechainPolicyOnDocument).toHaveBeenCalled();
    expect(outcome).toEqual({ ok: true });
    expect(reportNotificationResolved).toHaveBeenCalledWith("failure:evt-1");
  });

  it("re-runs the stashed operation over the repaired bytes, not the original", async () => {
    const outcome = await registry().REPAIR?.run(
      context({ kindId: "INPUT_CORRUPTED" }),
    );

    expect(repairDocuments).toHaveBeenCalledWith(["f-1"]);
    const [payload, files] = retryWithFiles.mock.calls[0] as [
      { endpoint: string },
      File[],
    ];
    expect(payload.endpoint).toBe("/api/v1/misc/compress-pdf");
    expect(await bytesOf(files[0])).toBe("repaired");
    expect(outcome).toEqual({ ok: true });
    expect(reportNotificationResolved).toHaveBeenCalledWith("failure:evt-1");
    // The repaired input is never versioned onto the original on a tool row: only what the
    // re-run makes is kept, so the damaged document is left exactly as the user had it.
    expect(consumeFiles).not.toHaveBeenCalled();
  });

  it("adopts the re-run's output and nothing else", async () => {
    retryWithFiles.mockResolvedValue({
      ok: true,
      files: [
        {
          blob: new Blob(["smaller"], { type: "application/pdf" }),
          filename: "invoice_compressed.pdf",
        },
      ],
    });

    await registry().REPAIR?.run(context({ kindId: "INPUT_CORRUPTED" }));

    const [files, options] = addFiles.mock.calls[0];
    expect((files as File[]).map((file) => file.name)).toEqual([
      "invoice_compressed.pdf",
    ]);
    expect(options).toEqual({ selectFiles: true, derivedFromTool: true });
    expect(addFiles).toHaveBeenCalledTimes(1);
    expect(consumeFiles).not.toHaveBeenCalled();
  });

  it("is not offered when the stash lost a password, since that re-run would be a different one", async () => {
    // Add Password on a damaged file: stashed without the password, a re-run would hand back an
    // unprotected document and close the row as fixed.
    const lostSecret = context({
      kindId: "INPUT_CORRUPTED",
      retryPayload: {
        operation: "addPassword",
        endpoint: "/api/v1/security/add-password",
        params: {},
        fileIds: ["f-1"],
        multiFile: false,
        errorCode: "E001",
        secretsStripped: true,
        recordedAt: 0,
      },
    });
    const actions = registry();

    expect(actions.REPAIR?.available(lostSecret)).toBe(false);
    // The plain retry still opens the tool, where the password can be typed again.
    expect(actions.OPEN_IN_TOOL?.available(lostSecret)).toBe(true);
    expect(await actions.REPAIR?.run(lostSecret)).toEqual({
      ok: false,
      message: "This document can no longer be retried from this browser.",
    });
    expect(repairDocuments).not.toHaveBeenCalled();
  });

  it("repairs every input a merge would re-send, not just the one the row names", async () => {
    // E002 is the multi-file corruption: re-running with one sibling still broken fails again.
    repairDocuments.mockResolvedValue({
      ok: true,
      repaired: ["f-1", "f-2"].map((fileId) => ({
        fileId,
        file: { blob: new Blob(["repaired"]), filename: `${fileId}.pdf` },
      })),
    });

    await registry().REPAIR?.run(
      context({
        kindId: "INPUT_CORRUPTED",
        retryPayload: {
          operation: "merge",
          endpoint: "/api/v1/general/merge-pdfs",
          params: {},
          fileIds: ["f-1", "f-2"],
          multiFile: true,
          errorCode: "E002",
          secretsStripped: false,
          recordedAt: 0,
        },
      }),
    );

    expect(repairDocuments).toHaveBeenCalledWith(["f-1", "f-2"]);
    // One re-run carrying both, which is the call that failed in the first place.
    expect(retryWithFiles).toHaveBeenCalledTimes(1);
    expect((retryWithFiles.mock.calls[0] as [unknown, File[]])[1]).toHaveLength(
      2,
    );
    // Repaired only to feed the re-run: the four siblings that were never damaged keep their
    // originals rather than being swapped for Ghostscript's rewrite of them.
    expect(consumeFiles).not.toHaveBeenCalled();
    expect(addFiles).not.toHaveBeenCalled();
  });

  it("versions each repaired document under the original it came from", async () => {
    openFilesById = { "f-1": { id: "f-1", name: "invoice.pdf" } };

    await registry().REPAIR?.run(policyContext({ kindId: "INPUT_CORRUPTED" }));

    // consumeFiles, not addFiles: the repaired copy replaces the original in the workbench.
    expect(consumeFiles).toHaveBeenCalledWith(
      ["f-1"],
      expect.anything(),
      expect.anything(),
    );
    expect(addFiles).not.toHaveBeenCalled();
  });

  it("stops at a failed repair, leaving the row open with the server's words", async () => {
    repairDocuments.mockResolvedValue({
      ok: false,
      reason: "serverMessage",
      message: "Repair failed with available tools.",
    });

    const outcome = await registry().REPAIR?.run(
      policyContext({ kindId: "INPUT_CORRUPTED" }),
    );

    expect(outcome).toEqual({
      ok: false,
      message: "Repair failed with available tools.",
    });
    expect(rechainPolicyOnDocument).not.toHaveBeenCalled();
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("leaves the row open when the repair worked but the re-run failed again", async () => {
    retryWithFiles.mockResolvedValue({
      ok: false,
      reason: "serverMessage",
      message: "PDF file appears to be corrupted or damaged.",
    });

    const outcome = await registry().REPAIR?.run(
      context({ kindId: "INPUT_CORRUPTED" }),
    );

    expect(outcome).toEqual({
      ok: false,
      message: "PDF file appears to be corrupted or damaged.",
    });
    expect(reportNotificationResolved).not.toHaveBeenCalled();
    // And the workbench is untouched, so pressing again changes nothing rather than adding a
    // second repaired copy each time.
    expect(consumeFiles).not.toHaveBeenCalled();
    expect(addFiles).not.toHaveBeenCalled();
  });

  it("leaves the row open when the policy re-run cannot be tracked", async () => {
    rechainPolicyOnDocument.mockResolvedValue({ ok: true, tracked: false });

    const outcome = await registry().REPAIR?.run(
      policyContext({ kindId: "INPUT_CORRUPTED" }),
    );

    expect(outcome?.ok).toBe(false);
    expect(outcome?.message).toContain("repaired");
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("is offered only where the repaired document has somewhere to land", async () => {
    expect(
      registry().REPAIR?.available(
        policyContext({ kindId: "INPUT_CORRUPTED" }),
      ),
    ).toBe(true);
    // Without a workbench the row promotes the next action instead.
    expect(
      registry(inProcessor).REPAIR?.available(
        policyContext({ kindId: "INPUT_CORRUPTED" }),
      ),
    ).toBe(false);
  });

  it("is not offered once the document has left this browser", async () => {
    expect(
      registry().REPAIR?.available(
        context({ kindId: "INPUT_CORRUPTED", hasLocalFile: false }),
      ),
    ).toBe(false);
  });

  it("is not offered for a stash belonging to a different failure on the same file", async () => {
    // The stash on this file belongs to the E004 row, not this one.
    expect(
      registry().REPAIR?.available(
        context({
          kindId: "INPUT_CORRUPTED",
          retryPayload: {
            operation: "removePassword",
            endpoint: "/api/v1/security/remove-password",
            params: {},
            fileIds: ["f-1"],
            multiFile: false,
            errorCode: "E004",
            secretsStripped: false,
            recordedAt: 0,
          },
        }),
      ),
    ).toBe(false);
  });

  it("never asks for a password, having nothing to do with one", async () => {
    expect(registry().REPAIR?.needsPassword).toBeFalsy();
  });
});
