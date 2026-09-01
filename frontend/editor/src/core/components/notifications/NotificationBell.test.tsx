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
  NotificationActionSlot,
} from "@app/services/notifications";

// @app/ui Button is a Mantine wrapper, so it needs the provider in the tree.
const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: MantineProvider });

// The bell's own two jobs: what counts as read, and how a row behaves around an action.

const fetchNotifications = vi.fn();

// A bare array is wrapped as a reviewer's response; member filtering is the hook's own test.
vi.mock("@app/services/notifications", () => ({
  fetchNotifications: async (...args: unknown[]) => {
    const value = await fetchNotifications(...args);
    return Array.isArray(value)
      ? { notifications: value, viewerReviewsTeam: true, viewerKey: "viewer-a" }
      : value;
  },
}));

// IndexedDB, which jsdom has none of. Answered here so availability is a fact of the test.
const h = vi.hoisted(() => ({
  hasLocalFile: true,
  retryPayload: { operation: "removePassword" } as unknown,
  // This build has the notifications API, except in the one test about the build that does not.
  notificationsAvailable: true,
  specs: {} as Record<
    string,
    {
      available: (context: unknown) => boolean;
      run: (context: unknown, password?: string) => unknown;
      needsPassword?: boolean;
      closesPanel?: boolean;
    }
  >,
}));

vi.mock("@app/services/notificationRetry", () => ({
  hasLocalFile: () => Promise.resolve(h.hasLocalFile),
  loadRetryPayload: () => Promise.resolve(h.retryPayload),
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
      // The kinds' sentences live in the locale files, so one stands in here.
      if (key.endsWith(".description")) return "Kind description";
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
  slot: NotificationActionSlot = "SECONDARY",
  overrides: Partial<NotificationActionOffer> = {},
): NotificationActionOffer {
  return {
    id,
    labelKey: `portal.failures.action.${id.toLowerCase()}`,
    defaultLabel: id,
    slot,
    enabled: true,
    disabledReasonKey: null,
    ...overrides,
  };
}

// Read state watermarks the ordering time, so rows need distinct ones. "a" is the newest.
const AT: Record<string, string> = {
  a: "2026-08-05T02:00:00Z",
  b: "2026-08-05T01:00:00Z",
};

/** Scoped to the viewer the mocked response names, as the store writes it. */
const READ_THROUGH_KEY = "stirling.notifications.readThroughAt.viewer-a";

function markReadThrough(iso: string): void {
  window.localStorage.setItem(READ_THROUGH_KEY, String(Date.parse(iso)));
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
    createdAt: AT[id] ?? "2026-08-05T00:00:00Z",
    lastSeenAt: AT[id] ?? "2026-08-05T00:00:00Z",
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
    h.retryPayload = { operation: "removePassword" };
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
    markReadThrough(AT.b);
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
    markReadThrough(AT.b);
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
    markReadThrough(AT.a);
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
    const arrived = notification("c", "Unrecognised failure", {
      lastSeenAt: "2026-08-05T03:00:00Z",
    });
    fetchNotifications.mockResolvedValue([arrived, notification("a")]);
    render(<NotificationBell />);

    expect(await screen.findByText("1")).toBeTruthy();
  });

  it("leaves the rest read when the row that was newest has gone", async () => {
    // The newest row leaves; marking read by id would then relight the badge for the older one.
    markReadThrough(AT.a);
    fetchNotifications.mockResolvedValue([notification("b")]);

    render(<NotificationBell />);
    await openPanel();

    // Nothing is new, so nothing is labelled new: by id, this row would have counted as unread.
    expect(await screen.findByText("Unrecognised failure")).toBeTruthy();
    expect(screen.queryByText("New")).toBeNull();
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

  it("tucks overflow actions into a menu, not a row of buttons", async () => {
    h.specs = {
      DECRYPT: { available: () => true, run: vi.fn() },
      VIEW_FILE: { available: () => true, run: vi.fn() },
      VIEW_IN_PROCESSOR: { available: () => true, run: vi.fn() },
    };
    fetchNotifications.mockResolvedValue([
      notification("a", "Unrecognised failure", {
        actions: [
          offer("DECRYPT", "RESOLUTION"),
          offer("VIEW_FILE", "SECONDARY"),
          offer("VIEW_IN_PROCESSOR", "OVERFLOW"),
        ],
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    // Two real buttons; the overflow one is off screen until the menu is opened.
    expect(
      screen.getByRole("button", {
        name: "DECRYPT: Unrecognised failure",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "VIEW_FILE: Unrecognised failure" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "VIEW_IN_PROCESSOR: Unrecognised failure",
      }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "More options: Unrecognised failure",
      }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "VIEW_IN_PROCESSOR" }),
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
          "This document is not on this device, so it cannot be opened or retried here.",
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
        "This failure is not linked to a specific document, so it cannot be opened or retried here.",
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
          offer("VIEW_FILE", "SECONDARY", {
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
          offer("VIEW_IN_PROCESSOR", "SECONDARY", {
            enabled: false,
            disabledReasonKey: "portal.failures.disabled.closed",
          }),
          offer("VIEW_FILE", "SECONDARY", {
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
    // The error log stays reachable: a row with nothing left to do still owns its detail.
    expect(
      screen.getByRole("button", {
        name: "More options: Unrecognised failure",
      }),
    ).toBeTruthy();
  });

  it("asks for the password in the unlock modal before it retries", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    h.specs = {
      DECRYPT_AND_RETRY: {
        available: () => true,
        run,
        needsPassword: true,
        closesPanel: true,
      },
    };
    fetchNotifications.mockResolvedValue([
      notification("a", "Password-protected document", {
        actions: [offer("DECRYPT_AND_RETRY", "RESOLUTION")],
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    // The click opens the app's unlock modal rather than running anything.
    fireEvent.click(
      screen.getByRole("button", {
        name: "DECRYPT_AND_RETRY: Password-protected document",
      }),
    );
    expect(run).not.toHaveBeenCalled();

    const field = await screen.findByLabelText("PDF password");
    fireEvent.change(field, { target: { value: "hunter2" } });
    // The modal's confirm carries the action's own wording, not a generic "unlock".
    fireEvent.click(screen.getByRole("button", { name: "DECRYPT_AND_RETRY" }));

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][1]).toBe("hunter2");
    // Resolved server-side, so the list is re-read and the panel gets out of the way.
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText("Password-protected document")).toBeNull(),
    );
  });

  it("shows a failed unlock in the modal instead of leaving the user guessing", async () => {
    h.specs = {
      DECRYPT_AND_RETRY: {
        available: () => true,
        run: () => Promise.resolve({ ok: false, message: "Wrong password" }),
        needsPassword: true,
      },
    };
    fetchNotifications.mockResolvedValue([
      notification("a", "Password-protected document", {
        actions: [offer("DECRYPT_AND_RETRY", "RESOLUTION")],
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    fireEvent.click(
      screen.getByRole("button", {
        name: "DECRYPT_AND_RETRY: Password-protected document",
      }),
    );
    const field = await screen.findByLabelText("PDF password");
    fireEvent.change(field, { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "DECRYPT_AND_RETRY" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Wrong password",
    );
    // The prompt stays up, so the next attempt is one keystroke rather than a re-open.
    expect(screen.getByLabelText("PDF password")).toBeTruthy();
  });

  it("reads the kind's own words rather than the raw failure", async () => {
    // A bell is not a log: the row gets a sentence, the message goes in the menu.
    const stack = "org.apache.pdfbox.InvalidPasswordException";
    fetchNotifications.mockResolvedValue([
      notification("a", "Password-protected document", {
        titleKey: "portal.failures.kind.inputPasswordProtected.title",
        detail: stack,
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    expect(await screen.findByText("Kind description")).toBeTruthy();
    expect(screen.queryByText(stack)).toBeNull();
  });

  it("keeps the log one click away, for a row whose only extra is the log", async () => {
    h.specs = { VIEW_FILE: { available: () => true, run: vi.fn() } };
    const stack = "org.apache.pdfbox.InvalidPasswordException";
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: clipboard } });
    fetchNotifications.mockResolvedValue([
      notification("a", "Unrecognised failure", {
        detail: stack,
        actions: [offer("VIEW_FILE", "SECONDARY")],
      }),
    ]);
    render(<NotificationBell />);
    await openPanel();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "More options: Unrecognised failure",
      }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy log" }));

    await waitFor(() => expect(clipboard).toHaveBeenCalledWith(stack));
  });
});
