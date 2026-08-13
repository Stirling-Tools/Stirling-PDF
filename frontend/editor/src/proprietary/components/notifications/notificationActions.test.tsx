import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type {
  AppNotification,
  NotificationActionOffer,
} from "@app/services/notifications";
import type { NotificationActionContext } from "@core/components/notifications/notificationActions";

/**
 * What this build can actually do about a failure, and where each action sends the reader. The bell hangs
 * in the editor and in the processor, and only the editor has a file context above it, so the two shells
 * are the interesting cases: selecting the document directly, or handing it over.
 */

const retryWithPassword = vi.fn();
const unlockLocalDocument = vi.fn();
vi.mock("@app/services/notificationRetry", () => ({
  retryWithPassword: (...args: unknown[]) => retryWithPassword(...args),
  unlockLocalDocument: (...args: unknown[]) => unlockLocalDocument(...args),
}));

const rerunPolicy = vi.fn();
const rerunPolicyOnDocument = vi.fn();
vi.mock("@app/services/notificationPolicyRetry", () => ({
  rerunPolicy: (...args: unknown[]) => rerunPolicy(...args),
  rerunPolicyOnDocument: (...args: unknown[]) => rerunPolicyOnDocument(...args),
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

// No i18n instance is initialised here, so the real hook would return bare keys. The plugin is
// stubbed too because the workbench contexts below reach `core/i18n`, which registers it on import.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// The document lookup reads IndexedDB, which jsdom has none of. Answered here so that whether the
// bytes are present is a fact of the test rather than of the environment.
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
/** What the workbench already holds, so the "do not add it twice" path can be exercised. */
let openFileIds: string[] = [];
const setSelectedFiles = vi.fn();
const addFiles = vi.fn();

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

/** An action the server offered, enabled: what it does with it is the client's decision. */
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
      recordedAt: 0,
    },
    ...overrides,
  };
}

/**
 * A failure of an attended policy run: the editor started it on a document it was holding, so the
 * row names the policy and that document, and no stash was ever written for it.
 */
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
        actions: { addStirlingFileStubs, setSelectedFiles, addFiles } as never,
        dispatch: vi.fn(),
      }}
    >
      <FileStoreContext.Provider
        value={
          {
            getState: () => ({ files: { ids: openFileIds } }),
            subscribe: () => () => {},
            selectors: {},
          } as never
        }
      >
        <NavigationActionsContext.Provider
          value={{ actions: { setWorkbench } } as never}
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
  h.getStirlingFileStub.mockReset().mockResolvedValue(h.stub);
  openFileIds = [];
  setSelectedFiles.mockReset();
  // The workspace's own id for the adopted document, which is what a policy re-run's output belongs
  // to - not the reference the failure was filed against.
  addFiles.mockReset().mockResolvedValue([{ fileId: "f-unlocked" }]);
  reportNotificationResolved.mockReset().mockResolvedValue(true);
  retryWithPassword.mockReset().mockResolvedValue({ ok: true, files: [] });
  // The unlock succeeds by default and produces a document, since almost every case below is about
  // what happens to it afterwards.
  unlockLocalDocument.mockReset().mockResolvedValue({
    ok: true,
    files: [
      {
        blob: new Blob(["pdf"], { type: "application/pdf" }),
        filename: "invoice.pdf",
      },
    ],
  });
  // Tracked by default: the run is in the store, so something is polling it and its output will
  // arrive. An untracked run is a separate case below, since it changes what the row may claim.
  rerunPolicy.mockReset().mockResolvedValue({ ok: true, tracked: true });
  rerunPolicyOnDocument.mockReset().mockResolvedValue({
    ok: true,
    tracked: true,
  });
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("useNotificationActions", () => {
  it("opens the failed tool with the document selected", () => {
    registry().RETRY?.run(context());

    expect(setSelectedFiles).toHaveBeenCalledWith(["f-1"]);
    // The tool the stashed operation names, so the user sees the settings before it runs again.
    expect(window.location.pathname).toBe("/remove-password");
  });

  it("opens the editor itself when the stashed operation names no tool this build has", () => {
    registry().RETRY?.run(
      context({
        retryPayload: {
          operation: "quarantine",
          endpoint: "/api/v1/quarantine",
          params: {},
          fileIds: ["f-1"],
          recordedAt: 0,
        },
      }),
    );

    expect(window.location.pathname).toBe("/");
  });

  it("offers no retry once the document has left this browser", () => {
    const actions = registry();

    expect(actions.RETRY?.available(context({ hasLocalFile: false }))).toBe(
      false,
    );
    expect(actions.RETRY?.available(context({ retryPayload: null }))).toBe(
      false,
    );
    expect(actions.VIEW_FILE?.available(context({ hasLocalFile: false }))).toBe(
      false,
    );
  });

  it("leaves View file as the only usable offer when the server offers actions this build cannot run", () => {
    // The server can ship new kinds with new actions ahead of the clients that understand them, so
    // an id this build wires nothing for drops out rather than rendering dead.
    const actions = registry();
    const usable = [offer("QUARANTINE"), offer("VIEW_FILE")].filter(
      (candidate) => actions[candidate.id]?.available(context()) ?? false,
    );

    expect(usable.map((candidate) => candidate.id)).toEqual(["VIEW_FILE"]);
  });

  it("opens the document into the viewer when an editor is above", async () => {
    await registry().VIEW_FILE?.run(context());

    // Selecting alone would show nothing: the workbench does not hold the file yet, and it keeps
    // whatever view it was already on.
    expect(addStirlingFileStubs).toHaveBeenCalledWith([h.stub]);
    expect(setActiveFileId).toHaveBeenCalledWith("f-1");
    expect(setWorkbench).toHaveBeenCalledWith("viewer");
  });

  it("stays where it is rather than routing through the role-based root", async () => {
    // "/" decides a landing page from the reader's role, so navigating there reads as the app
    // reloading and can land them somewhere other than their document.
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

    // Nothing to open into, so the intent outlives the navigation that mounts the editor.
    expect(
      window.sessionStorage.getItem("stirling.notifications.pendingSelection"),
    ).toBe("f-1");
    // The editor's own URL, not "/", which would hand the reader to the role router instead.
    expect(window.location.pathname).toBe("/editor");
  });

  it("picks up a handed-over document as soon as an editor is there", async () => {
    window.sessionStorage.setItem(
      "stirling.notifications.pendingSelection",
      "f-9",
    );

    registry();
    await vi.waitFor(() => expect(setActiveFileId).toHaveBeenCalledWith("f-9"));

    expect(setWorkbench).toHaveBeenCalledWith("viewer");
    // One-shot: a later mount must not reopen a document the user has moved on from.
    expect(
      window.sessionStorage.getItem("stirling.notifications.pendingSelection"),
    ).toBeNull();
  });

  it("unlocks with the password it was given and reports what came back", async () => {
    retryWithPassword.mockResolvedValue({ ok: false, message: "Wrong" });

    const outcome = await registry().DECRYPT_AND_RETRY?.run(
      context(),
      "hunter2",
    );

    expect(retryWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "/api/v1/security/remove-password" }),
      "hunter2",
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

    const outcome = await registry().DECRYPT_AND_RETRY?.run(
      context(),
      "hunter2",
    );

    expect(outcome).toEqual({ ok: true });
    const [files, options] = addFiles.mock.calls[0];
    expect((files as File[]).map((file) => file.name)).toEqual(["invoice.pdf"]);
    // Selected as well as added, so it is the document on screen when the panel closes; and marked
    // in-app so `usePolicyAutoRun` does not enforce the upload chain on it by itself.
    expect(options).toEqual({ selectFiles: true, derivedFromTool: true });
    // And the incident is closed, with the prefixed id: nothing else tells the server the client
    // fixed it, so the bell would otherwise keep reporting a failure the user has dealt with.
    expect(reportNotificationResolved).toHaveBeenCalledWith("failure:evt-1");
  });

  it("closes the incident only once the document is safely in", async () => {
    // Reported first, then a failed adoption, would leave the row closed with nothing to show.
    retryWithPassword.mockResolvedValue({
      ok: true,
      files: [{ blob: new Blob(["pdf"]), filename: "invoice.pdf" }],
    });
    addFiles.mockRejectedValue(new Error("quota"));

    await registry().DECRYPT_AND_RETRY?.run(context(), "hunter2");

    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("keeps the unlock a success when the server will not record it", async () => {
    // A reviewer dismissed the row first, or it was never this caller's. The document is already in
    // the workbench, so a refused resolve must not present as a failed unlock.
    retryWithPassword.mockResolvedValue({
      ok: true,
      files: [{ blob: new Blob(["pdf"]), filename: "invoice.pdf" }],
    });
    reportNotificationResolved.mockResolvedValue(false);

    expect(
      await registry().DECRYPT_AND_RETRY?.run(context(), "hunter2"),
    ).toEqual({ ok: true });
  });

  it("reports a failure when the unlocked document cannot be taken in", async () => {
    // Unlocked but dropped is the one outcome that leaves the user with nothing, so it is never
    // reported as success.
    retryWithPassword.mockResolvedValue({
      ok: true,
      files: [{ blob: new Blob(["pdf"]), filename: "invoice.pdf" }],
    });
    addFiles.mockRejectedValue(new Error("quota"));

    const outcome = await registry().DECRYPT_AND_RETRY?.run(
      context(),
      "hunter2",
    );

    expect(outcome).toEqual({
      ok: false,
      message:
        "The document was unlocked but could not be opened here. Try the tool directly.",
    });
  });

  it("offers no unlock where there is nowhere to put the result", async () => {
    // The processor shell has no FileContext, so unlocking would produce a document with nowhere to
    // go. The row promotes its next offer instead.
    const actions = registry(inProcessor);

    expect(actions.DECRYPT_AND_RETRY?.available(context())).toBe(false);
    expect(actions.VIEW_IN_PROCESSOR?.available(context())).toBe(true);
    // And it refuses rather than posting a password whose output would be discarded.
    expect(await actions.DECRYPT_AND_RETRY?.run(context(), "hunter2")).toEqual({
      ok: false,
      message: "This document can no longer be retried from this browser.",
    });
    expect(retryWithPassword).not.toHaveBeenCalled();
  });

  it("offers the unlock where the editor can take the result", () => {
    expect(registry().DECRYPT_AND_RETRY?.available(context())).toBe(true);
    expect(
      registry().DECRYPT_AND_RETRY?.available(context({ hasLocalFile: false })),
    ).toBe(false);
  });

  it("says it cannot hand the document over rather than navigating to nothing", async () => {
    // Storage refused, so nothing would be selected on arrival: the row reports it and stays put.
    // On the prototype: jsdom's storage object is a proxy, so an own-property spy does not take.
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
    // Still on the page it started on, so the failure is visible rather than mysterious.
    expect(window.location.pathname).toBe("/");
    setItem.mockRestore();
  });

  it("says so rather than posting nothing when the stash has gone", async () => {
    const outcome = await registry().DECRYPT_AND_RETRY?.run(
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

  it("offers the processor link whenever the server did", () => {
    // The server only sends it to someone it will let read the queue, so there is nothing left
    // to gate here.
    expect(
      registry(inProcessor).VIEW_IN_PROCESSOR?.available(
        context({ hasLocalFile: false, retryPayload: null }),
      ),
    ).toBe(true);
  });
});

/**
 * The other retry shape. An attended policy run stashes nothing, so everything these actions need
 * comes off the row itself: which policy failed, and which document this browser was holding.
 */
describe("retrying an attended policy run", () => {
  it("runs the policy again on the document it already holds", async () => {
    const outcome = await registry().RETRY?.run(policyContext());

    expect(rerunPolicy).toHaveBeenCalledWith({
      policyId: "pol-1",
      fileId: "f-1",
    });
    expect(outcome).toEqual({ ok: true });
    // Nothing was stashed for this row, so nothing may be read from one either.
    expect(retryWithPassword).not.toHaveBeenCalled();
  });

  it("re-runs the policy rather than reopening a tool, even where a stash happens to exist", async () => {
    // The same document can have failed a tool run earlier, leaving a stash keyed on it. The row
    // is about the policy, so that is what runs again.
    await registry().RETRY?.run(
      policyContext({
        retryPayload: {
          operation: "removePassword",
          endpoint: "/api/v1/security/remove-password",
          params: {},
          fileIds: ["f-1"],
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

    expect(await registry().RETRY?.run(policyContext())).toEqual({
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

    expect(await registry().RETRY?.run(policyContext())).toEqual({
      ok: false,
      message:
        "The policy could not be run again just now. Try again in a moment.",
    });
  });

  it("reports the document is gone rather than blaming the policy", async () => {
    rerunPolicy.mockResolvedValue({ ok: false, reason: "missingFile" });

    expect(await registry().RETRY?.run(policyContext())).toEqual({
      ok: false,
      message:
        "This document is not on this device, so it cannot be opened or retried here.",
    });
  });

  it("is offered for an attended row whose document is here, and for nothing else", () => {
    const actions = registry();

    expect(actions.RETRY?.available(policyContext())).toBe(true);
    expect(actions.DECRYPT_AND_RETRY?.available(policyContext())).toBe(true);

    // Unattended: the fileId is a source's hash of a path that was never on any device, so there
    // is nothing here to re-submit. The server disables the owner's actions on these anyway.
    const unattended = policyContext({
      notification: notification({
        origin: "POLICY",
        policyId: "pol-1",
        sourceId: "src-1",
      }),
    });
    expect(actions.RETRY?.available(unattended)).toBe(false);
    expect(actions.DECRYPT_AND_RETRY?.available(unattended)).toBe(false);

    // No policy named, and no stash either: nothing describes what would run again.
    expect(
      actions.RETRY?.available(
        policyContext({
          notification: notification({ origin: "POLICY", policyId: null }),
        }),
      ),
    ).toBe(false);

    // Document gone from this browser.
    expect(
      actions.RETRY?.available(policyContext({ hasLocalFile: false })),
    ).toBe(false);
  });

  it("is offered nowhere without an editor to collect the result", () => {
    // The processor shell mounts the bell outside the app's providers, so a run fired from there
    // would have no workspace to land its output in.
    const actions = registry(inProcessor);

    expect(actions.RETRY?.available(policyContext())).toBe(false);
    expect(actions.DECRYPT_AND_RETRY?.available(policyContext())).toBe(false);
  });

  it("refuses rather than firing a run the processor shell could not collect", async () => {
    expect(await registry(inProcessor).RETRY?.run(policyContext())).toEqual({
      ok: false,
      message: "This document can no longer be retried from this browser.",
    });
    expect(rerunPolicy).not.toHaveBeenCalled();
  });

  it("unlocks, takes the document in, runs the policy again, then closes the incident", async () => {
    const order: string[] = [];
    addFiles.mockImplementation(async () => {
      order.push("adopt");
      return [{ fileId: "f-unlocked" }];
    });
    rerunPolicyOnDocument.mockImplementation(async () => {
      order.push("rerun");
      return { ok: true, tracked: true };
    });
    reportNotificationResolved.mockImplementation(async () => {
      order.push("resolve");
      return true;
    });

    const outcome = await registry().DECRYPT_AND_RETRY?.run(
      policyContext(),
      "hunter2",
    );

    expect(outcome).toEqual({ ok: true });
    // The unlock is the remove-password call on the document the row names, not a stashed endpoint.
    expect(unlockLocalDocument).toHaveBeenCalledWith("f-1", "hunter2");
    // Added and selected, so the unlocked document is what is on screen once the panel closes. The
    // encrypted original is left alone: the user never asked to lose it.
    const [files, options] = addFiles.mock.calls[0];
    expect((files as File[]).map((file) => file.name)).toEqual(["invoice.pdf"]);
    // derivedFromTool is what stops the adoption starting a SECOND run of this same policy: the
    // dispatch effect in usePolicyAutoRun treats a plain upload as work to enforce. A policy run is
    // a billed automation run, so a double dispatch double-charges and can open a second incident.
    expect(options).toEqual({ selectFiles: true, derivedFromTool: true });
    // Re-submitted under the ORIGINAL reference, so a second failure folds onto this same incident
    // instead of opening a new one about the same document - while the run's output is attributed to
    // the ADOPTED document, which is the one now in front of the user.
    expect(rerunPolicyOnDocument).toHaveBeenCalledWith(
      { policyId: "pol-1", fileId: "f-1" },
      expect.any(File),
      "f-unlocked",
    );
    // And with the prefixed notification id, never a raw failure id.
    expect(reportNotificationResolved).toHaveBeenCalledWith("failure:evt-1");
    expect(order).toEqual(["adopt", "rerun", "resolve"]);
  });

  it("starts exactly one run for one click", async () => {
    await registry().DECRYPT_AND_RETRY?.run(policyContext(), "hunter2");

    // One submission, from here. The other possible source is the adoption, which is silenced by
    // derivedFromTool above; see the gate's own test in usePolicyAutoRun.chain.test.tsx.
    expect(rerunPolicyOnDocument).toHaveBeenCalledTimes(1);
    expect(rerunPolicy).not.toHaveBeenCalled();
    expect(addFiles.mock.calls[0][1]).toMatchObject({ derivedFromTool: true });
  });

  it("still runs when the adoption reports no workspace id, rather than guessing one", async () => {
    // Nothing to attribute the output to, so the run goes untracked rather than being filed against
    // the encrypted original, which would version the wrong document.
    addFiles.mockResolvedValue([]);
    rerunPolicyOnDocument.mockResolvedValue({ ok: true, tracked: false });

    await registry().DECRYPT_AND_RETRY?.run(policyContext(), "hunter2");

    expect(rerunPolicyOnDocument).toHaveBeenCalledWith(
      { policyId: "pol-1", fileId: "f-1" },
      expect.any(File),
      null,
    );
  });

  it("leaves the row open when the re-run cannot deliver, and says why", async () => {
    // The run went, but untracked: nothing polls it, so the processed document never reaches the
    // workbench. The unlocked INPUT is in, which is not what the user was after, so this may not
    // present as success. Closing the row here would retire a failure that produced nothing and
    // still billed a run.
    rerunPolicyOnDocument.mockResolvedValue({ ok: true, tracked: false });

    expect(
      await registry().DECRYPT_AND_RETRY?.run(policyContext(), "hunter2"),
    ).toEqual({
      ok: false,
      message:
        "The document was unlocked and the policy re-run started, but its result cannot be delivered here, so this failure stays open.",
    });
    // Adopted regardless: the password bought them the unlocked document either way.
    expect(addFiles).toHaveBeenCalled();
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("says an untracked plain re-run cannot be delivered either", async () => {
    // Same hole without a password in it: the local cache could not place the policy, so the run is
    // unpolled and its output is not coming. The reader is told rather than shown a silent success.
    rerunPolicy.mockResolvedValue({ ok: true, tracked: false });

    expect(await registry().RETRY?.run(policyContext())).toEqual({
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

    expect(
      await registry().DECRYPT_AND_RETRY?.run(policyContext(), "wrong"),
    ).toEqual({ ok: false, message: "The password is incorrect." });
    expect(addFiles).not.toHaveBeenCalled();
    expect(rerunPolicyOnDocument).not.toHaveBeenCalled();
    // The row is still a failure, so nothing may report it fixed.
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("neither re-runs nor closes the incident when the document cannot be taken in", async () => {
    addFiles.mockRejectedValue(new Error("quota"));

    expect(
      await registry().DECRYPT_AND_RETRY?.run(policyContext(), "hunter2"),
    ).toEqual({
      ok: false,
      message:
        "The document was unlocked but could not be opened here. Try the tool directly.",
    });
    expect(rerunPolicyOnDocument).not.toHaveBeenCalled();
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("says the unlock worked but the re-run did not, and leaves the row open", async () => {
    rerunPolicyOnDocument.mockResolvedValue({
      ok: false,
      reason: "rejected",
      message: "Queue full.",
    });

    expect(
      await registry().DECRYPT_AND_RETRY?.run(policyContext(), "hunter2"),
    ).toEqual({
      ok: false,
      message:
        "The document was unlocked and opened here, but the policy could not be run on it again.",
    });
    // Adopted anyway: the password bought them the unlocked document, and that is theirs to keep.
    expect(addFiles).toHaveBeenCalled();
    // But nothing is fixed server-side, so the incident stays open.
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("never hands the password to anything but the unlock", async () => {
    await registry().DECRYPT_AND_RETRY?.run(policyContext(), "hunter2");

    // Everything downstream of the unlock: the adoption, the re-run, the resolve. The password is
    // an argument to one call and goes out of scope after it - it is in no payload, no stash and no
    // id, so nothing here can persist it.
    const downstream = [
      ...addFiles.mock.calls,
      ...rerunPolicyOnDocument.mock.calls,
      ...reportNotificationResolved.mock.calls,
    ];
    expect(JSON.stringify(downstream)).not.toContain("hunter2");
    // Not in the file that goes back to the policy either: those are the server's unlocked bytes.
    const [, document] = rerunPolicyOnDocument.mock.calls[0] as [
      unknown,
      File,
      unknown,
    ];
    expect(await bytesOf(document)).not.toContain("hunter2");
  });
});
