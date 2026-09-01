import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AppNotification } from "@app/services/notifications";
import { QuickNavRailNotifications } from "@app/components/shared/quickNav/QuickNavRailNotifications";

const fetchNotifications = vi.fn();

vi.mock("@app/services/notifications", () => ({
  fetchNotifications: (...args: unknown[]) => fetchNotifications(...args),
}));

vi.mock("@app/services/localFilePresence", () => ({
  hasLocalFile: () => Promise.resolve(false),
}));

const h = vi.hoisted(() => ({ notificationsAvailable: true }));

vi.mock("@app/components/notifications/useNotificationsAvailable", () => ({
  useNotificationsAvailable: () => h.notificationsAvailable,
}));

function notification(id: string): AppNotification {
  return {
    id,
    kind: "PIPELINE_FAILED",
    title: id,
    createdAt: "2026-01-01T00:00:00Z",
    fileId: null,
    sourceId: null,
    count: 1,
    actions: [],
  } as unknown as AppNotification;
}

describe("QuickNavRailNotifications", () => {
  beforeEach(() => {
    window.localStorage.clear();
    fetchNotifications
      .mockReset()
      .mockResolvedValue({ notifications: [], viewerReviewsTeam: true });
    h.notificationsAvailable = true;
  });

  it("keeps out of a build with no notifications API, and off its timer", async () => {
    // No endpoint to poll and nothing it could show.
    h.notificationsAvailable = false;

    const { container } = render(
      <QuickNavRailNotifications onToggle={() => {}} />,
    );

    await Promise.resolve();
    expect(container.querySelector(".quick-nav-rail-item")).toBeNull();
    expect(fetchNotifications).not.toHaveBeenCalled();
  });

  it("carries the unread count on the icon", async () => {
    // A reviewer's response, so nothing is filtered for want of a local document.
    fetchNotifications.mockResolvedValue({
      notifications: [notification("a"), notification("b")],
      viewerReviewsTeam: true,
    });

    render(<QuickNavRailNotifications onToggle={() => {}} />);

    expect(await screen.findByText("2")).toBeTruthy();
  });

  it("asks the mounted app to open the panel rather than opening one itself", async () => {
    const onToggle = vi.fn();
    const { container } = render(
      <QuickNavRailNotifications onToggle={onToggle} />,
    );

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    fireEvent.click(container.querySelector(".quick-nav-rail-item")!);

    expect(onToggle).toHaveBeenCalledTimes(1);
    // No panel of its own: a row's actions would have no workbench to act on.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays pressable before an app has registered, doing nothing", async () => {
    // Between apps there is briefly no handler.
    const { container } = render(<QuickNavRailNotifications />);

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    const button = container.querySelector(".quick-nav-rail-item")!;
    expect(() => fireEvent.click(button)).not.toThrow();
  });
});
