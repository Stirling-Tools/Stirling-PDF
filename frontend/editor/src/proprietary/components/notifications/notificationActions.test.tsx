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
 * Where each action sends the reader. Only the editor has the workbench contexts above it, so the two
 * shells are the interesting cases: opening the document, or handing it over.
 */

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
/** What the workbench already holds, so the "do not add it twice" path can be exercised. */
let openFileIds: string[] = [];

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
    titleKey: "processor.failures.kind.inputPasswordProtected.title",
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
    labelKey: `processor.failures.action.${id.toLowerCase()}`,
    defaultLabel: id,
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
    ...overrides,
  };
}

/** The editor shell: the workbench's providers all sit above the bell. */
const inEditor = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <FileActionsContext.Provider
      value={{
        actions: { addStirlingFileStubs } as never,
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

/** The processor shell: the processor mounts above the app's providers, so there is none. */
const inProcessor = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

function registry(wrapper = inEditor) {
  return renderHook(() => useNotificationActions(), { wrapper }).result.current;
}

beforeEach(() => {
  navigate.mockReset();
  addStirlingFileStubs.mockReset().mockResolvedValue([]);
  setActiveFileId.mockReset();
  setWorkbench.mockReset();
  h.getStirlingFileStub.mockReset().mockResolvedValue(h.stub);
  openFileIds = [];
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("useNotificationActions", () => {
  it("offers to open the document only while it is still in this browser", () => {
    const actions = registry();

    expect(actions.VIEW_FILE?.available(context())).toBe(true);
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
    ).toBe("f-1");
    // The editor's own URL, not the role router at "/".
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

  it("links to the recorded failures section of the processor", () => {
    registry().VIEW_IN_PROCESSOR?.run(context());

    expect(navigate).toHaveBeenCalledWith("/processor/documents#failures");
  });

  it("offers the processor link whenever the server did", () => {
    // The server only sends it to someone it will let read the queue.
    expect(
      registry(inProcessor).VIEW_IN_PROCESSOR?.available(
        context({ hasLocalFile: false }),
      ),
    ).toBe(true);
  });
});
