import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type {
  AppNotification,
  NotificationActionOffer,
} from "@app/services/notifications";
import type { NotificationActionContext } from "@core/components/notifications/notificationActions";

// Where each action sends the reader. Only the editor has the workbench contexts above it.

const retryWithPassword = vi.fn();
const unlockLocalDocument = vi.fn();
vi.mock("@app/services/notificationRetry", async (importOriginal) => ({
  // The real stashMatchesKind: it is pure, and its guard is part of what these tests exercise.
  ...(await importOriginal<typeof import("@app/services/notificationRetry")>()),
  retryWithPassword: (...args: unknown[]) => retryWithPassword(...args),
  unlockLocalDocument: (...args: unknown[]) => unlockLocalDocument(...args),
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

function notification(
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: "failure:evt-1",
    source: "FAILURE",
    kindId: "INPUT_PASSWORD_PROTECTED",
    origin: "TOOL",
    ownership: "MINE",
    severity: "ERROR",
    status: "NEW",
    titleKey: "portal.failures.kind.inputPasswordProtected.title",
    defaultTitle: "Password-protected document",
    detail: "The PDF Document is passworded",
    fileId: "f-1",
    sourceId: null,
    policyId: null,
    occurrences: 3,
    createdAt: "2026-08-06T00:00:00Z",
    lastSeenAt: "2026-08-06T00:00:00Z",
    actions: [],
    ...overrides,
  };
}

function offer(id: string): NotificationActionOffer {
  return {
    id,
    labelKey: `portal.failures.action.${id.toLowerCase()}`,
    defaultLabel: id,
    slot: "SECONDARY",
    enabled: true,
    disabledReasonKey: null,
  };
}

function context(
  overrides: Partial<NotificationActionContext> = {},
): NotificationActionContext {
  return {
    notification: notification(),
    hasLocalFile: true,
    retryPayload: {
      operation: "removePassword",
      endpoint: "/api/v1/security/remove-password",
      params: {},
      fileIds: ["f-1"],
      multiFile: false,
      errorCode: "E004",
      recordedAt: 0,
    },
    ...overrides,
  };
}

/** An attended policy run: the row names the policy and the document, and nothing was stashed. */
function policyContext(
  overrides: Partial<NotificationActionContext> = {},
): NotificationActionContext {
  return {
    notification: notification({
      origin: "POLICY",
      policyId: "pol-1",
      sourceId: null,
    }),
    hasLocalFile: true,
    retryPayload: null,
    ...overrides,
  };
}

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

/** The processor shell: the portal mounts above the app's providers, so there is none. */
const inProcessor = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

function registry(wrapper = inEditor) {
  return renderHook(() => useNotificationActions(), { wrapper }).result.current;
}

/** A file's own bytes. Via FileReader because this environment's Blob has no `text`. */
function bytesOf(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
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
  // Tracked by default: something is polling the run, so its output will arrive.
  rerunPolicy.mockReset().mockResolvedValue({ ok: true, tracked: true });
  rechainPolicyOnDocument.mockReset().mockResolvedValue({
    ok: true,
    tracked: true,
  });
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

  it("stays where it is rather than routing through the role-based root", async () => {
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

  it("unlocks with the password it was given and reports what came back", async () => {
    retryWithPassword.mockResolvedValue({ ok: false, message: "Wrong" });

    const outcome = await registry().DECRYPT?.run(context(), "hunter2");

    expect(retryWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "/api/v1/security/remove-password" }),
      "hunter2",
      // The row's own document, so a single-file endpoint is not handed the whole batch.
      "f-1",
    );
    expect(outcome).toEqual({ ok: false, message: "Wrong" });
  });

  it("takes the unlocked document into the workbench through FileContext", async () => {
    // The whole point of the password: the user must end up holding the unlocked file.
    retryWithPassword.mockResolvedValue({
      ok: true,
      files: [
        {
          blob: new Blob(["pdf"], { type: "application/pdf" }),
          filename: "invoice.pdf",
        },
      ],
    });

    const outcome = await registry().DECRYPT?.run(context(), "hunter2");

    expect(outcome).toEqual({ ok: true });
    const [files, options] = addFiles.mock.calls[0];
    expect((files as File[]).map((file) => file.name)).toEqual(["invoice.pdf"]);
    // Selected so it is on screen, and marked in-app so `usePolicyAutoRun` leaves it alone.
    expect(options).toEqual({ selectFiles: true, derivedFromTool: true });
    // And closed with the prefixed id: nothing else tells the server the client fixed it.
    expect(reportNotificationResolved).toHaveBeenCalledWith("failure:evt-1");
  });

  it("replaces the encrypted original in place when it is open in the workbench", async () => {
    // The failed document is on screen, so the unlock versions it rather than adding a second copy.
    openFileIds = ["f-1"];
    openFilesById = {
      "f-1": { id: "f-1", name: "invoice.pdf", versionNumber: 1 },
    };
    unlockLocalDocument.mockResolvedValue({
      ok: true,
      files: [
        {
          blob: new Blob(["pdf"], { type: "application/pdf" }),
          filename: "invoice.pdf",
        },
      ],
    });

    const outcome = await registry().DECRYPT?.run(policyContext(), "hunter2");

    expect(outcome).toEqual({ ok: true });
    // Consumed, not added: the encrypted original is versioned, so there is only ever one document.
    expect(addFiles).not.toHaveBeenCalled();
    const [inputIds, , stubs] = consumeFiles.mock.calls[0];
    expect(inputIds).toEqual(["f-1"]);
    // Still in-app, so usePolicyAutoRun does not enforce the chain on it — the rechain does that.
    expect(
      (stubs as Array<{ derivedFromTool?: boolean }>)[0].derivedFromTool,
    ).toBe(true);
  });

  it("versions a document the workbench has closed, rather than adding a copy of it", async () => {
    // Closed in the sidebar but still on the device: adding here left the user holding both.
    openFileIds = [];
    openFilesById = {};

    await registry().DECRYPT?.run(policyContext(), "hunter2");

    expect(addFiles).not.toHaveBeenCalled();
    expect(consumeFiles.mock.calls[0][0]).toEqual(["f-1"]);
  });

  it("adds the unlocked document when nothing on this device holds the original", async () => {
    // No stub anywhere: there is no version chain to extend, so adding is all that is left.
    h.getStirlingFileStub.mockResolvedValue(null);

    await registry().DECRYPT?.run(policyContext(), "hunter2");

    expect(consumeFiles).not.toHaveBeenCalled();
    expect(addFiles.mock.calls[0][1]).toEqual({
      selectFiles: true,
      derivedFromTool: true,
    });
  });

  it("closes the incident only once the document is safely in", async () => {
    // Reported first, then a failed adoption, would leave the row closed with nothing to show.
    retryWithPassword.mockResolvedValue({
      ok: true,
      files: [{ blob: new Blob(["pdf"]), filename: "invoice.pdf" }],
    });
    addFiles.mockRejectedValue(new Error("quota"));

    await registry().DECRYPT?.run(context(), "hunter2");

    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("keeps the unlock a success when the server will not record it", async () => {
    // The document is already in the workbench, so a refused resolve is not a failed unlock.
    retryWithPassword.mockResolvedValue({
      ok: true,
      files: [{ blob: new Blob(["pdf"]), filename: "invoice.pdf" }],
    });
    reportNotificationResolved.mockResolvedValue(false);

    expect(await registry().DECRYPT?.run(context(), "hunter2")).toEqual({
      ok: true,
    });
  });

  it("reports a failure when the unlocked document cannot be taken in", async () => {
    // Unlocked but dropped leaves the user with nothing, so it is never reported as success.
    retryWithPassword.mockResolvedValue({
      ok: true,
      files: [{ blob: new Blob(["pdf"]), filename: "invoice.pdf" }],
    });
    addFiles.mockRejectedValue(new Error("quota"));

    const outcome = await registry().DECRYPT?.run(context(), "hunter2");

    expect(outcome).toEqual({
      ok: false,
      message:
        "The document was unlocked but could not be opened here. Try the tool directly.",
    });
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

  it("offers the unlock where the editor can take the result", () => {
    expect(registry().DECRYPT?.available(context())).toBe(true);
    expect(
      registry().DECRYPT?.available(context({ hasLocalFile: false })),
    ).toBe(false);
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

  it("says so rather than posting nothing when the stash has gone", async () => {
    const outcome = await registry().DECRYPT?.run(
      context({ retryPayload: null }),
      "hunter2",
    );

    expect(retryWithPassword).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      ok: false,
      message: "This document can no longer be retried from this browser.",
    });
  });

  it("links to the recorded failures section of the processor", () => {
    registry().VIEW_IN_PROCESSOR?.run(context());

    expect(navigate).toHaveBeenCalledWith("/processor/documents#failures");
  });

  it("navigates in place even with a loaded workbench, never opening a tab", () => {
    openFileIds = ["f-1"];
    const openTab = vi.spyOn(window, "open");

    registry().VIEW_IN_PROCESSOR?.run(context());

    expect(openTab).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/processor/documents#failures");
    openTab.mockRestore();
  });

  it("navigates in place from the processor too", () => {
    const openTab = vi.spyOn(window, "open");

    registry(inProcessor).VIEW_IN_PROCESSOR?.run(context());

    expect(openTab).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/processor/documents#failures");
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

  it("unlocks, takes the document in, runs the policy again, then closes the incident", async () => {
    const order: string[] = [];
    consumeFiles.mockImplementation(async () => {
      order.push("adopt");
      return ["f-unlocked"];
    });
    rechainPolicyOnDocument.mockImplementation(async () => {
      order.push("rerun");
      return { ok: true, tracked: true };
    });
    reportNotificationResolved.mockImplementation(async () => {
      order.push("resolve");
      return true;
    });

    const outcome = await registry().DECRYPT?.run(policyContext(), "hunter2");

    expect(outcome).toEqual({ ok: true });
    // The unlock is the remove-password call on the document the row names, not a stashed endpoint.
    expect(unlockLocalDocument).toHaveBeenCalledWith("f-1", "hunter2");
    // Versioned onto the encrypted original, so there is one document rather than two.
    expect(addFiles).not.toHaveBeenCalled();
    const [inputIds, files, stubs] = consumeFiles.mock.calls[0];
    expect(inputIds).toEqual(["f-1"]);
    expect((files as File[]).map((file) => file.name)).toEqual(["invoice.pdf"]);
    // derivedFromTool stops the adoption starting a SECOND, billed run of this same policy.
    expect(
      (stubs as Array<{ derivedFromTool?: boolean }>)[0].derivedFromTool,
    ).toBe(true);
    // Under the ORIGINAL reference so a repeat folds on, with the output on the ADOPTED document.
    expect(rechainPolicyOnDocument).toHaveBeenCalledWith(
      { policyId: "pol-1", fileId: "f-1" },
      expect.any(File),
      "f-unlocked",
      // No app-config above this render, so the engine reads as off and Classification drops out.
      false,
    );
    // And with the prefixed notification id, never a raw failure id.
    expect(reportNotificationResolved).toHaveBeenCalledWith("failure:evt-1");
    expect(order).toEqual(["adopt", "rerun", "resolve"]);
  });

  it("starts exactly one run for one click", async () => {
    await registry().DECRYPT?.run(policyContext(), "hunter2");

    // One submission: the adoption's is silenced by derivedFromTool above.
    expect(rechainPolicyOnDocument).toHaveBeenCalledTimes(1);
    expect(rerunPolicy).not.toHaveBeenCalled();
    expect(consumeFiles.mock.calls[0][2][0]).toMatchObject({
      derivedFromTool: true,
    });
  });

  it("still runs when the adoption reports no workspace id, rather than guessing one", async () => {
    // Nothing to attribute the output to, so the run goes untracked rather than to the original.
    consumeFiles.mockResolvedValue([]);
    rechainPolicyOnDocument.mockResolvedValue({ ok: true, tracked: false });

    await registry().DECRYPT?.run(policyContext(), "hunter2");

    expect(rechainPolicyOnDocument).toHaveBeenCalledWith(
      { policyId: "pol-1", fileId: "f-1" },
      expect.any(File),
      null,
      false,
    );
  });

  it("leaves the row open when the re-run cannot deliver, and says why", async () => {
    // Untracked, so the processed document never arrives: the unlocked input is not the point.
    rechainPolicyOnDocument.mockResolvedValue({ ok: true, tracked: false });

    expect(await registry().DECRYPT?.run(policyContext(), "hunter2")).toEqual({
      ok: false,
      message:
        "The document was unlocked and the policy re-run started, but its result cannot be delivered here, so this failure stays open.",
    });
    // Adopted regardless: the password bought them the unlocked document either way.
    expect(consumeFiles).toHaveBeenCalled();
    expect(reportNotificationResolved).not.toHaveBeenCalled();
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

  it("shows a wrong password for what it is, and touches nothing else", async () => {
    unlockLocalDocument.mockResolvedValue({
      ok: false,
      message: "The password is incorrect.",
    });

    expect(await registry().DECRYPT?.run(policyContext(), "wrong")).toEqual({
      ok: false,
      message: "The password is incorrect.",
    });
    expect(addFiles).not.toHaveBeenCalled();
    expect(rechainPolicyOnDocument).not.toHaveBeenCalled();
    // The row is still a failure, so nothing may report it fixed.
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("neither re-runs nor closes the incident when the document cannot be taken in", async () => {
    consumeFiles.mockRejectedValue(new Error("quota"));

    expect(await registry().DECRYPT?.run(policyContext(), "hunter2")).toEqual({
      ok: false,
      message:
        "The document was unlocked but could not be opened here. Try the tool directly.",
    });
    expect(rechainPolicyOnDocument).not.toHaveBeenCalled();
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("says the unlock worked but the re-run did not, and leaves the row open", async () => {
    rechainPolicyOnDocument.mockResolvedValue({
      ok: false,
      reason: "rejected",
      message: "Queue full.",
    });

    expect(await registry().DECRYPT?.run(policyContext(), "hunter2")).toEqual({
      ok: false,
      message:
        "The document was unlocked and opened here, but the policy could not be run on it again.",
    });
    // Adopted anyway: the password bought them the unlocked document, and that is theirs to keep.
    expect(consumeFiles).toHaveBeenCalled();
    // But nothing is fixed server-side, so the incident stays open.
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("never hands the password to anything but the unlock", async () => {
    await registry().DECRYPT?.run(policyContext(), "hunter2");

    // Everything downstream of the unlock: no payload, stash or id carries the password.
    const downstream = [
      ...addFiles.mock.calls,
      ...rechainPolicyOnDocument.mock.calls,
      ...reportNotificationResolved.mock.calls,
    ];
    expect(JSON.stringify(downstream)).not.toContain("hunter2");
    // Not in the file that goes back to the policy either: those are the server's unlocked bytes.
    const [, document] = rechainPolicyOnDocument.mock.calls[0] as [
      unknown,
      File,
      unknown,
    ];
    expect(await bytesOf(document)).not.toContain("hunter2");
  });
});
