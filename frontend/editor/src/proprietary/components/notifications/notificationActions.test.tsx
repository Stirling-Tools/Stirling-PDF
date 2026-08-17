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

const navigate = vi.fn();
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  )),
  useNavigate: () => navigate,
}));

// No i18n instance is initialised here, so the real hook would return bare keys.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

const { FileActionsContext } = await import("@app/contexts/file/contexts");
const { useNotificationActions } =
  await import("@app/components/notifications/notificationActions");

const setSelectedFiles = vi.fn();

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

/** The editor shell: a file context sits above the bell. */
const inEditor = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <FileActionsContext.Provider
      value={{
        actions: { setSelectedFiles } as never,
        dispatch: vi.fn(),
      }}
    >
      {children}
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

beforeEach(() => {
  navigate.mockReset();
  setSelectedFiles.mockReset();
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
    // The server can ship new kinds with new actions ahead of the clients that understand them, so
    // an id this build wires nothing for drops out rather than rendering dead.
    const actions = registry();
    const usable = [offer("QUARANTINE"), offer("VIEW_FILE")].filter(
      (candidate) => actions[candidate.id]?.available(context()) ?? false,
    );

    expect(usable.map((candidate) => candidate.id)).toEqual(["VIEW_FILE"]);
  });

  it("opens the document with it selected when an editor is above", () => {
    registry().VIEW_FILE?.run(context());

    expect(setSelectedFiles).toHaveBeenCalledWith(["f-1"]);
    expect(window.location.pathname).toBe("/");
  });

  it("hands the document over when there is no editor above it", () => {
    registry(inProcessor).VIEW_FILE?.run(context());

    // Nothing to select against, so the intent outlives the navigation that mounts the editor.
    expect(
      window.sessionStorage.getItem("stirling.notifications.pendingSelection"),
    ).toBe("f-1");
    expect(window.location.pathname).toBe("/");
  });

  it("picks up a handed-over document as soon as an editor is there", () => {
    window.sessionStorage.setItem(
      "stirling.notifications.pendingSelection",
      "f-9",
    );

    registry();

    expect(setSelectedFiles).toHaveBeenCalledWith(["f-9"]);
    // One-shot: a later mount must not re-select a document the user has moved on from.
    expect(
      window.sessionStorage.getItem("stirling.notifications.pendingSelection"),
    ).toBeNull();
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

  it("links to the recorded failures section of the processor", () => {
    registry().VIEW_IN_PROCESSOR?.run(context());

    expect(navigate).toHaveBeenCalledWith("/processor/documents#failures");
  });

  it("offers the processor link whenever the server did", () => {
    // The server only sends it to someone it will let read the queue, so there is nothing left
    // to gate here.
    expect(
      registry(inProcessor).VIEW_IN_PROCESSOR?.available(
        context({ hasLocalFile: false }),
      ),
    ).toBe(true);
  });
});
