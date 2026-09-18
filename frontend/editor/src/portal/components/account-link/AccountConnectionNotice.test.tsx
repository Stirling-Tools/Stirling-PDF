import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AccountConnectionNotice } from "@portal/components/account-link/AccountConnectionNotice";

const mocks = vi.hoisted(() => ({
  link: {
    status: {
      connection: {
        state: "expired",
        offlineAccessUntil: "2026-09-18T10:00:00Z",
      },
    },
    refresh: vi.fn().mockResolvedValue(undefined),
  },
  refetch: vi.fn(),
}));
vi.mock("@portal/contexts/AccountLinkContext", () => ({
  useAccountLinkOptional: () => mocks.link,
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ refetch: mocks.refetch }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/ui", () => ({
  Banner: ({
    title,
    children,
    action,
  }: {
    title: string;
    children: React.ReactNode;
    action: React.ReactNode;
  }) => (
    <div role="alert">
      {title}
      {children}
      {action}
    </div>
  ),
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}));

describe("offline account notice", () => {
  it("explains paused features, retries and removes the warning on recovery", async () => {
    mocks.link.status.connection.state = "expired";
    const view = render(<AccountConnectionNotice />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Cloud-backed Team features and Processor work are paused",
    );
    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
    await waitFor(() => expect(mocks.link.refresh).toHaveBeenCalledWith(true));
    mocks.link.status.connection.state = "connected";
    view.rerender(<AccountConnectionNotice />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.refetch).toHaveBeenCalled();
  });
  it("warns before the deadline without claiming features are paused", () => {
    mocks.link.status.connection.state = "offline";
    render(<AccountConnectionNotice />);
    expect(screen.getByRole("alert").textContent).toContain(
      "last confirmed plan remains available",
    );
    expect(screen.getByRole("alert").textContent).not.toContain(
      "features and Processor work are paused",
    );
  });
});
