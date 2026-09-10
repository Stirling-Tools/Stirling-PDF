import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  context,
  inProcessor,
  notification,
  offer,
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
const canPlacePolicy = vi.fn();
vi.mock("@app/services/notificationPolicyRetry", () => ({
  canPlacePolicy: (...args: unknown[]) => canPlacePolicy(...args),
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
  // Placeable by default: the browser still holds the policy the failure names.
  canPlacePolicy.mockReset().mockReturnValue(true);
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("useNotificationActions", () => {
  it("opens the failed tool on the failed document alone, in the viewer", async () => {
    await registry().OPEN_IN_TOOL?.run(context());

    expect(addStirlingFileStubs).toHaveBeenCalledWith([h.stub]);
    expect(setActiveFileId).toHaveBeenCalledWith("f-1");
    // The viewer scopes the tool to this one file. Any other view would hand it the whole
    // workbench, so a retry on one failed document would re-run across every open file.
    expect(setToolAndWorkbench).toHaveBeenCalledWith(
      "removePassword",
      "viewer",
    );
  });

  it("opens the document alone when the stashed operation names no tool this build has", async () => {
    await registry().OPEN_IN_TOOL?.run(
      context({
        retryPayload: {
          operation: "quarantine",
          endpoint: "/api/v1/quarantine",
          params: {},
          fileIds: ["f-1"],
          multiFile: false,
          errorCode: "E004",
          secretsStripped: false,
          recordedAt: 0,
        },
      }),
    );

    expect(setActiveFileId).toHaveBeenCalledWith("f-1");
    expect(setWorkbench).toHaveBeenCalledWith("viewer");
    expect(setToolAndWorkbench).not.toHaveBeenCalled();
  });

  it("reports a retry whose document has gone from storage rather than opening nothing", async () => {
    h.getStirlingFileStub.mockResolvedValue(null);

    const outcome = await registry().OPEN_IN_TOOL?.run(context());

    expect(outcome).toEqual({
      ok: false,
      message: "This document can no longer be retried from this browser.",
    });
    expect(setToolAndWorkbench).not.toHaveBeenCalled();
  });

  it("offers no retry once the document has left this browser", () => {
    const actions = registry();

    expect(
      actions.OPEN_IN_TOOL?.available(context({ hasLocalFile: false })),
    ).toBe(false);
    expect(
      actions.OPEN_IN_TOOL?.available(context({ retryPayload: null })),
    ).toBe(false);
    expect(actions.VIEW_FILE?.available(context({ hasLocalFile: false }))).toBe(
      false,
    );
  });

  it("leaves View file as the only usable offer when the server offers actions this build cannot run", () => {
    // An id this build wires nothing for drops out rather than rendering dead.
    const actions = registry();
    const usable = [offer("QUARANTINE"), offer("VIEW_FILE")].filter(
      (candidate) => actions[candidate.id]?.available(context()) ?? false,
    );

    expect(usable.map((candidate) => candidate.id)).toEqual(["VIEW_FILE"]);
  });

  it("opens the document into the viewer when an editor is above", async () => {
    await registry().VIEW_FILE?.run(context());

    // Selecting alone shows nothing: the workbench holds neither the file nor the viewer yet.
    expect(addStirlingFileStubs).toHaveBeenCalledWith([h.stub]);
    expect(setActiveFileId).toHaveBeenCalledWith("f-1");
    expect(setWorkbench).toHaveBeenCalledWith("viewer");
  });

  it("stays where it is rather than routing through the landing root", async () => {
    // "/" lands on a page chosen by the reader's role, which reads as the app reloading.
    await registry().VIEW_FILE?.run(context());

    expect(window.location.pathname).toBe("/");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not add a document the workbench is already holding", async () => {
    openFileIds = ["f-1"];

    await registry().VIEW_FILE?.run(context());

    expect(addStirlingFileStubs).not.toHaveBeenCalled();
    // Still brought to the front: the point of the click is to look at it.
    expect(setActiveFileId).toHaveBeenCalledWith("f-1");
    expect(setWorkbench).toHaveBeenCalledWith("viewer");
  });

  it("reports a document that has gone from storage instead of opening nothing", async () => {
    h.getStirlingFileStub.mockResolvedValue(null);

    const outcome = await registry().VIEW_FILE?.run(context());

    expect(outcome).toEqual({ ok: false });
    expect(setWorkbench).not.toHaveBeenCalled();
  });

  it("hands the document over to the editor when there is no workbench above it", async () => {
    await registry(inProcessor).VIEW_FILE?.run(context());

    // The intent outlives the navigation that mounts the editor.
    expect(
      window.sessionStorage.getItem("stirling.notifications.pendingSelection"),
    ).toBe(JSON.stringify({ fileId: "f-1", tool: null }));
    // The editor's own URL, not the role router at "/".
    expect(window.location.pathname).toBe("/editor");
  });

  it("hands the tool over with the document, so a retry arrives scoped", async () => {
    await registry(inProcessor).OPEN_IN_TOOL?.run(context());

    expect(
      window.sessionStorage.getItem("stirling.notifications.pendingSelection"),
    ).toBe(JSON.stringify({ fileId: "f-1", tool: "removePassword" }));
    expect(window.location.pathname).toBe("/remove-password");
  });

  it("picks up a handed-over document as soon as an editor is there", async () => {
    window.sessionStorage.setItem(
      "stirling.notifications.pendingSelection",
      JSON.stringify({ fileId: "f-9", tool: null }),
    );

    registry();
    await vi.waitFor(() => expect(setActiveFileId).toHaveBeenCalledWith("f-9"));

    expect(setWorkbench).toHaveBeenCalledWith("viewer");
    expect(setToolAndWorkbench).not.toHaveBeenCalled();
    // One-shot: a later mount must not reopen a document the user has moved on from.
    expect(
      window.sessionStorage.getItem("stirling.notifications.pendingSelection"),
    ).toBeNull();
  });

  it("arrives scoped, so a retry handed over from the processor runs on one file", async () => {
    window.sessionStorage.setItem(
      "stirling.notifications.pendingSelection",
      JSON.stringify({ fileId: "f-9", tool: "removePassword" }),
    );

    registry();

    // One dispatch, not a workbench change the URL sync could then overwrite with a stale view.
    await vi.waitFor(() =>
      expect(setToolAndWorkbench).toHaveBeenCalledWith(
        "removePassword",
        "viewer",
      ),
    );
    expect(setWorkbench).not.toHaveBeenCalled();
  });

  it("ignores a handed-over tool this build does not have", async () => {
    window.sessionStorage.setItem(
      "stirling.notifications.pendingSelection",
      JSON.stringify({ fileId: "f-9", tool: "quarantine" }),
    );

    registry();
    await vi.waitFor(() => expect(setWorkbench).toHaveBeenCalledWith("viewer"));

    expect(setToolAndWorkbench).not.toHaveBeenCalled();
  });

  it("offers no unlock where there is nowhere to put the result", async () => {
    // No FileContext there, so an unlocked document would have nowhere to go.
    const actions = registry(inProcessor);

    expect(actions.DECRYPT?.available(context())).toBe(false);
    expect(actions.VIEW_IN_PROCESSOR?.available(context())).toBe(true);
    // And it refuses rather than posting a password whose output would be discarded.
    expect(await actions.DECRYPT?.run(context(), "hunter2")).toEqual({
      ok: false,
      message: "This document can no longer be retried from this browser.",
    });
    expect(retryWithPassword).not.toHaveBeenCalled();
  });

  it("says it cannot hand the document over rather than navigating to nothing", async () => {
    // Spied on the prototype: jsdom's storage is a proxy, so an own-property spy does not take.
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    const outcome = await registry(inProcessor).VIEW_FILE?.run(context());

    expect(outcome).toEqual({
      ok: false,
      message:
        "This browser will not let the processor pass the document to the editor. Open it from the editor instead.",
    });
    // Still on the page it started on, so the failure is visible.
    expect(window.location.pathname).toBe("/");
    setItem.mockRestore();
  });

  it("links to the processor's review screen", () => {
    registry().VIEW_IN_PROCESSOR?.run(context());

    expect(navigate).toHaveBeenCalledWith("/processor/review");
  });

  it("navigates in place even with a loaded workbench, never opening a tab", () => {
    openFileIds = ["f-1"];
    const openTab = vi.spyOn(window, "open");

    registry().VIEW_IN_PROCESSOR?.run(context());

    expect(openTab).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/processor/review");
    openTab.mockRestore();
  });

  it("navigates in place from the processor too", () => {
    const openTab = vi.spyOn(window, "open");

    registry(inProcessor).VIEW_IN_PROCESSOR?.run(context());

    expect(openTab).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/processor/review");
    openTab.mockRestore();
  });

  it("offers the processor link whenever the server did", () => {
    // The server only sends it to someone it will let read the queue.
    expect(
      registry(inProcessor).VIEW_IN_PROCESSOR?.available(
        context({ hasLocalFile: false, retryPayload: null }),
      ),
    ).toBe(true);
  });
});

/** The other retry shape: nothing is stashed, so everything comes off the row itself. */
describe("retrying an attended policy run", () => {
  it("runs the policy again on the document it already holds", async () => {
    const outcome = await registry().OPEN_IN_TOOL?.run(policyContext());

    expect(rerunPolicy).toHaveBeenCalledWith({
      policyId: "pol-1",
      fileId: "f-1",
    });
    expect(outcome).toEqual({ ok: true });
    // Nothing was stashed for this row, so nothing may be read from one either.
    expect(retryWithPassword).not.toHaveBeenCalled();
  });

  it("submits nothing when the policy cannot be placed, so an unresolvable row stops billing", async () => {
    // Same leak as the resolutions, reached through the plain retry: the run is chargeable and
    // its output is uncollectable, and the row it fails to close keeps the button on offer.
    canPlacePolicy.mockReturnValue(false);
    const row = policyContext();

    expect(registry().OPEN_IN_TOOL?.available?.(row)).toBe(false);

    expect(await registry().OPEN_IN_TOOL?.run(row)).toEqual({
      ok: false,
      message: "This document can no longer be retried from this browser.",
    });
    expect(rerunPolicy).not.toHaveBeenCalled();
  });

  it("re-runs the policy rather than reopening a tool, even where a stash happens to exist", async () => {
    // An earlier tool failure may have left a stash, but the row is about the policy.
    await registry().OPEN_IN_TOOL?.run(
      policyContext({
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
    );

    expect(rerunPolicy).toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");
  });

  it("says the server refused rather than looking like it worked", async () => {
    rerunPolicy.mockResolvedValue({
      ok: false,
      reason: "rejected",
      message: "That policy is no longer enabled.",
    });

    expect(await registry().OPEN_IN_TOOL?.run(policyContext())).toEqual({
      ok: false,
      message: "That policy is no longer enabled.",
    });
  });

  it("has its own wording when the server refuses without any", async () => {
    rerunPolicy.mockResolvedValue({
      ok: false,
      reason: "rejected",
      message: null,
    });

    expect(await registry().OPEN_IN_TOOL?.run(policyContext())).toEqual({
      ok: false,
      message:
        "The policy could not be run again just now. Try again in a moment.",
    });
  });

  it("reports the document is gone rather than blaming the policy", async () => {
    rerunPolicy.mockResolvedValue({ ok: false, reason: "missingFile" });

    expect(await registry().OPEN_IN_TOOL?.run(policyContext())).toEqual({
      ok: false,
      message:
        "This document is not on this device, so it cannot be opened or retried here.",
    });
  });

  it("is offered for an attended row whose document is here, and for nothing else", () => {
    const actions = registry();

    expect(actions.OPEN_IN_TOOL?.available(policyContext())).toBe(true);
    expect(actions.DECRYPT?.available(policyContext())).toBe(true);

    // Unattended: the fileId hashes a path that was never on any device, so nothing can re-submit.
    const unattended = policyContext({
      notification: notification({
        origin: "POLICY",
        policyId: "pol-1",
        sourceId: "src-1",
      }),
    });
    expect(actions.OPEN_IN_TOOL?.available(unattended)).toBe(false);
    expect(actions.DECRYPT?.available(unattended)).toBe(false);

    // No policy named, and no stash either: nothing describes what would run again.
    expect(
      actions.OPEN_IN_TOOL?.available(
        policyContext({
          notification: notification({ origin: "POLICY", policyId: null }),
        }),
      ),
    ).toBe(false);

    // Document gone from this browser.
    expect(
      actions.OPEN_IN_TOOL?.available(policyContext({ hasLocalFile: false })),
    ).toBe(false);
  });

  it("is offered nowhere without an editor to collect the result", () => {
    // The bell mounts outside the app's providers there, so a run has nowhere to land.
    const actions = registry(inProcessor);

    expect(actions.OPEN_IN_TOOL?.available(policyContext())).toBe(false);
    expect(actions.DECRYPT?.available(policyContext())).toBe(false);
  });

  it("refuses rather than firing a run the processor shell could not collect", async () => {
    expect(
      await registry(inProcessor).OPEN_IN_TOOL?.run(policyContext()),
    ).toEqual({
      ok: false,
      message: "This document can no longer be retried from this browser.",
    });
    expect(rerunPolicy).not.toHaveBeenCalled();
  });

  it("says an untracked plain re-run cannot be delivered either", async () => {
    // Same hole without a password: the cache could not place the policy, so nothing polls the run.
    rerunPolicy.mockResolvedValue({ ok: true, tracked: false });

    expect(await registry().OPEN_IN_TOOL?.run(policyContext())).toEqual({
      ok: false,
      message:
        "The policy re-run started, but its result cannot be delivered here, so this failure stays open.",
    });
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });
});
