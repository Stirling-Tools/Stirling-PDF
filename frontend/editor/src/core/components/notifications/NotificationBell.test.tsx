import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type {
  AppNotification,
  NotificationActionOffer,
} from "@app/services/notifications";

// @app/ui Button is a Mantine wrapper, so it needs the provider in the tree.
const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });

/**
 * Two things are the bell's own and worth pinning: which notifications the user has already looked
 * at, and how a row behaves around an action.
 */

const fetchNotifications = vi.fn();

vi.mock("@app/services/notifications", () => ({
  fetchNotifications: (...args: unknown[]) => fetchNotifications(...args),
}));

// IndexedDB, which jsdom has none of. Answered here so availability is a fact of the test.
const h = vi.hoisted(() => ({
  hasLocalFile: true,
  // This build has the notifications API, except in the one test about the build that does not.
  notificationsAvailable: true,
  specs: {} as Record<
    string,
    {
      available: (context: unknown) => boolean;
      run: (context: unknown, password?: string) => unknown;
      closesPanel?: boolean;
    }
  >,
}));

vi.mock("@app/services/localFilePresence", () => ({
  hasLocalFile: () => Promise.resolve(h.hasLocalFile),
}));

vi.mock("@app/components/notifications/useNotificationsAvailable", () => ({
  useNotificationsAvailable: () => h.notificationsAvailable,
}));

// Core's own registry is empty, so without this there are no client actions to test.
vi.mock("@app/components/notifications/notificationActions", () => ({
  useNotificationActions: () => h.specs,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // A string fallback, or an options object with defaultValue plus what it interpolates.
    t: (key: string, fallback?: unknown) => {
      if (typeof fallback === "string") return fallback;
      if (fallback && typeof fallback === "object") {
        const options = fallback as Record<string, unknown>;
        const template = options.defaultValue;
        if (typeof template !== "string") return key;
        return template.replace(/{{(\w+)}}/g, (_match, name: string) =>
          String(options[name] ?? ""),
        );
      }
      return key;
    },
  }),
}));

const { NotificationBell } =
  await import("@app/components/notifications/NotificationBell");

function offer(
  id: string,
  overrides: Partial<NotificationActionOffer> = {},
): NotificationActionOffer {
  return {
    id,
    labelKey: `portal.failures.action.${id.toLowerCase()}`,
    defaultLabel: id,
    enabled: true,
    disabledReasonKey: null,
    ...overrides,
  };
}

function notification(
  id: string,
  title = "Unrecognised failure",
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    id,
    source: "FAILURE",
    kindId: "UNKNOWN",
    origin: "TOOL",
    ownership: "MINE",
    severity: "ERROR",
    status: "NEW",
    titleKey: `portal.failures.kind.${id}.title`,
    defaultTitle: title,
    detail: "boom",
    fileId: "f-1",
    sourceId: null,
    policyId: null,
    occurrences: 1,
    createdAt: "2026-08-05T00:00:00Z",
    lastSeenAt: "2026-08-05T00:00:00Z",
    actions: [],
    ...overrides,
  };
}

async function openPanel() {
  fireEvent.click(await screen.findByRole("button"));
}

describe("NotificationBell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    fetchNotifications.mockReset().mockResolvedValue([]);
    h.hasLocalFile = true;
    h.notificationsAvailable = true;
    h.specs = {};
  });

  it("mounts nothing at all in a build with no notifications API", async () => {
    // No bell and, above all, no poll: an OSS build must not sit on a timer collecting 404s.
    h.notificationsAvailable = false;

    render(<NotificationBell />);

    await Promise.resolve();
    expect(screen.queryByRole("button")).toBeNull();
    expect(fetchNotifications).not.toHaveBeenCalled();
  });

  it("shows no badge when there is nothing to report", async () => {
    render(<NotificationBell />);

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    expect(screen.queryByText("1")).toBeNull();
  });

  it("counts everything as unread the first time, since nothing has been seen", async () => {
    fetchNotifications.mockResolvedValue([
      notification("a"),
      notification("b"),
    ]);

    render(<NotificationBell />);

    expect(await screen.findByText("2")).toBeTruthy();
  });

  it("clears the badge once the user opens the panel", async () => {
    fetchNotifications.mockResolvedValue([
      notification("a"),
      notification("b"),
    ]);
    render(<NotificationBell />);
    await openPanel();

    // Opening marks them read: waiting for the close would leave the badge lit.
    await waitFor(() => expect(screen.queryByText("2")).toBeNull());
  });

  it("divides what is new from what the user has already seen", async () => {
    // "b" was the newest last time, so "a" is the only new one.
    window.localStorage.setItem("stirling.notifications.lastSeenId", "b");
    fetchNotifications.mockResolvedValue([
      notification("a"),
      notification("b"),
    ]);
    render(<NotificationBell />);
    await openPanel();

    expect(await screen.findByText("New")).toBeTruthy();
    expect(screen.getByText("Earlier")).toBeTruthy();
  });

  it("keeps the division on screen after opening marks them read", async () => {
    // Frozen on open: read live it would collapse the moment the badge cleared.
    window.localStorage.setItem("stirling.notifications.lastSeenId", "b");
    fetchNotifications.mockResolvedValue([
      notification("a"),
      notification("b"),
    ]);
    render(<NotificationBell />);
    await openPanel();

    await waitFor(() => expect(screen.queryByText("1")).toBeNull());
    expect(screen.getByText("New")).toBeTruthy();
    expect(screen.getByText("Earlier")).toBeTruthy();
  });

  it("does not divide a list with nothing new in it", async () => {
    window.localStorage.setItem("stirling.notifications.lastSeenId", "a");
    fetchNotifications.mockResolvedValue([notification("a")]);
    render(<NotificationBell />);
    await openPanel();

    // A lone "Earlier" heading over everything says nothing the empty badge has not.
    expect(await screen.findByText("Unrecognised failure")).toBeTruthy();
    expect(screen.queryByText("Earlier")).toBeNull();
    expect(screen.queryByText("New")).toBeNull();
  });

  it("labels an all-new list without inventing an earlier section", async () => {
    fetchNotifications.mockResolvedValue([
      notification("a"),
      notification("b"),
    ]);
    render(<NotificationBell />);
    await openPanel();

    expect(await screen.findByText("New")).toBeTruthy();
    expect(screen.queryByText("Earlier")).toBeNull();
  });

  it("marks only what arrived since the user last looked", async () => {
    fetchNotifications.mockResolvedValue([notification("a")]);
    const first = render(<NotificationBell />);
    await openPanel();
    await waitFor(() => expect(screen.queryByText("1")).toBeNull());
    first.unmount();

    // A newer one arrives above the one already seen.
    fetchNotifications.mockResolvedValue([
      notification("b"),
      notification("a"),
    ]);
    render(<NotificationBell />);

    expect(await screen.findByText("1")).toBeTruthy();
  });

  it("treats everything as unread when the last seen one is gone", async () => {
    // We cannot tell how far the user got, so show them rather than marking the lot read.
    window.localStorage.setItem(
      "stirling.notifications.lastSeenId",
      "vanished",
    );
    fetchNotifications.mockResolvedValue([
      notification("a"),
      notification("b"),
    ]);

    render(<NotificationBell />);

    expect(await screen.findByText("2")).toBeTruthy();
  });

  it("renders the server's title and repeat count without knowing the source", async () => {
    fetchNotifications.mockResolvedValue([
      { ...notification("a", "Password-protected document"), occurrences: 3 },
    ]);
    render(<NotificationBell />);
    await openPanel();

    expect(screen.getByText("Password-protected document")).toBeTruthy();
    expect(screen.getByText("3 times")).toBeTruthy();
  });

  it("puts every one of the row's actions on the row", async () => {
    h.specs = {
      VIEW_IN_PROCESSOR: {
        available: () => true,
        run: vi.fn(),
        closesPanel: true,
      },
      VIEW_FILE: { available: () => true, run: vi.fn(), closesPanel: true },
    };
    fetchNotifications.mockResolvedValue([
      notification("a", "Unrecognised failure", {
        actions: [offer("VIEW_IN_PROCESSOR"), offer("VIEW_FILE")],
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    // Named for their row: every button in the list says the same thing.
    for (const id of ["VIEW_IN_PROCESSOR", "VIEW_FILE"])
      expect(
        screen.getByRole("button", { name: `${id}: Unrecognised failure` }),
      ).toBeTruthy();
  });

  it("runs whichever of the row's actions is pressed", async () => {
    const run = vi.fn();
    h.specs = {
      VIEW_IN_PROCESSOR: { available: () => true, run: vi.fn() },
      VIEW_FILE: { available: () => true, run },
    };
    fetchNotifications.mockResolvedValue([
      notification("a", "Unrecognised failure", {
        actions: [offer("VIEW_IN_PROCESSOR"), offer("VIEW_FILE")],
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "VIEW_FILE: Unrecognised failure" }),
    );

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Unrecognised failure")).toBeTruthy();
  });

  it("closes the panel on its way to a destination behind it", async () => {
    const run = vi.fn();
    h.specs = { VIEW_FILE: { available: () => true, run, closesPanel: true } };
    fetchNotifications.mockResolvedValue([
      notification("a", "Password-protected document", {
        actions: [offer("VIEW_FILE")],
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    fireEvent.click(
      screen.getByRole("button", {
        name: "VIEW_FILE: Password-protected document",
      }),
    );

    expect(run).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByText("Password-protected document")).toBeNull(),
    );
  });

  it("skips an action id this build has never heard of", async () => {
    // A new failure kind can ship with new actions; an unwired button would be worse than none.
    fetchNotifications.mockResolvedValue([
      notification("a", "Unrecognised failure", {
        actions: [offer("QUARANTINE")],
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    expect(screen.getByText("Unrecognised failure")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /QUARANTINE/ })).toBeNull();
  });

  it("drops an action the device cannot perform, and says why the row is thin", async () => {
    h.hasLocalFile = false;
    h.specs = {
      VIEW_FILE: {
        available: (context) =>
          (context as { hasLocalFile: boolean }).hasLocalFile,
        run: vi.fn(),
      },
    };
    fetchNotifications.mockResolvedValue([
      notification("a", "Unrecognised failure", {
        actions: [offer("VIEW_FILE")],
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    await waitFor(() =>
      expect(
        screen.getByText(
          "This document is not on this device, so it cannot be opened here.",
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: /VIEW_FILE/ })).toBeNull();
  });

  it("says a row was never linked to a document, rather than that the document is missing", async () => {
    h.hasLocalFile = false;
    fetchNotifications.mockResolvedValue([
      notification("a", "Unrecognised failure", { fileId: null }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    expect(
      await screen.findByText(
        "This failure is not linked to a specific document, so there is nothing to open here.",
      ),
    ).toBeTruthy();
  });

  it("claims nothing about a device for a row it never looks up", async () => {
    // Never on any device, so never probed, and an absent lookup is not an absent document.
    h.hasLocalFile = false;
    fetchNotifications.mockResolvedValue([
      notification("a", "Password-protected document", {
        origin: "POLICY",
        sourceId: "src-s3-invoices",
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    expect(await screen.findByText("Password-protected document")).toBeTruthy();
    expect(
      screen.queryByText(
        /not on this device|not linked to a specific document/,
      ),
    ).toBeNull();
  });

  it("renders no button for an action the server would refuse, and says why in words", async () => {
    // A greyed button that can never work is false hope, so the reason becomes the row's note.
    h.specs = {
      VIEW_FILE: { available: () => true, run: vi.fn() },
      VIEW_IN_PROCESSOR: { available: () => true, run: vi.fn() },
    };
    fetchNotifications.mockResolvedValue([
      notification("a", "Unrecognised failure", {
        ownership: "UNOWNED",
        actions: [
          offer("VIEW_FILE", {
            enabled: false,
            disabledReasonKey: "portal.failures.disabled.unattended",
          }),
          offer("VIEW_IN_PROCESSOR"),
        ],
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    expect(screen.queryByRole("button", { name: /VIEW_FILE/ })).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "VIEW_IN_PROCESSOR: Unrecognised failure",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Not available for this notification."),
    ).toBeTruthy();
  });

  it("leaves a closed row with no buttons rather than a row of dead ones", async () => {
    h.specs = {
      VIEW_IN_PROCESSOR: { available: () => true, run: vi.fn() },
      VIEW_FILE: { available: () => true, run: vi.fn() },
    };
    fetchNotifications.mockResolvedValue([
      notification("a", "Unrecognised failure", {
        actions: [
          offer("VIEW_IN_PROCESSOR", {
            enabled: false,
            disabledReasonKey: "portal.failures.disabled.closed",
          }),
          offer("VIEW_FILE", {
            enabled: false,
            disabledReasonKey: "portal.failures.disabled.closed",
          }),
        ],
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    // The message and its chips remain, so the row still reads as a row.
    expect(screen.getByText("Unrecognised failure")).toBeTruthy();
    expect(
      screen.getByText("Not available for this notification."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /VIEW_IN_PROCESSOR|VIEW_FILE/ }),
    ).toBeNull();
    expect(document.querySelector(".notification-bell__actions")).toBeNull();
  });

  it("shows a failed action in the row instead of leaving the user guessing", async () => {
    h.specs = {
      VIEW_FILE: {
        available: () => true,
        run: () => Promise.resolve({ ok: false, message: "Could not open" }),
      },
    };
    fetchNotifications.mockResolvedValue([
      notification("a", "Password-protected document", {
        actions: [offer("VIEW_FILE")],
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    fireEvent.click(
      screen.getByRole("button", {
        name: "VIEW_FILE: Password-protected document",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Could not open",
    );
    // Still on screen, so the row remains actionable.
    expect(screen.getByText("Password-protected document")).toBeTruthy();
  });

  it("expands the message without touching the row's actions", async () => {
    fetchNotifications.mockResolvedValue([
      notification("a", "Unrecognised failure", {
        detail: "org.apache.pdfbox.InvalidPasswordException",
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    const expand = screen.getByRole("button", {
      name: "Show full message: Unrecognised failure",
    });
    fireEvent.click(expand);

    expect(
      screen.getByRole("button", { name: "Show less: Unrecognised failure" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Copy error: Unrecognised failure" }),
    ).toBeTruthy();
  });
});
