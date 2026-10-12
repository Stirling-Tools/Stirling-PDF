import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  AccountConnectionNotice,
  AccountConnectionRefresh,
} from "@app/portal/components/account-link/AccountConnectionNotice";

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
  isOwner: true,
  required: false,
  linkModalOpen: false,
}));
vi.mock("@app/portal/contexts/AccountLinkContext", () => ({
  useAccountLinkOptional: () => mocks.link,
}));
vi.mock("@app/portal/hooks/useAccountLinkOwner", () => ({
  useAccountLinkOwner: () => mocks.isOwner,
}));
vi.mock("@app/portal/hooks/usePortalSaasSession", () => ({
  usePortalSaasSession: () => ({ required: mocks.required }),
}));
vi.mock("@app/portal/contexts/UIContext", () => ({
  useUI: () => ({ linkModalOpen: mocks.linkModalOpen }),
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isOwner = true;
  mocks.required = false;
  mocks.linkModalOpen = false;
  mocks.link.status.connection.state = "expired";
});

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
    expect(mocks.refetch).not.toHaveBeenCalled();
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

it.each(["isOwner", "required", "linkModalOpen"] as const)(
  "hides the connection notice when %s prevents a competing owner action",
  (flag) => {
    mocks[flag] = flag !== "isOwner";
    render(<AccountConnectionNotice />);
    expect(screen.queryByRole("alert")).toBeNull();
  },
);

it("refreshes feature availability on local pages without rendering a notice", () => {
  const updated = vi.fn();
  window.addEventListener("stirling:billing-updated", updated);
  try {
    const view = render(<AccountConnectionRefresh />);
    expect(view.container).toBeEmptyDOMElement();
    mocks.link.status.connection.state = "connected";
    view.rerender(<AccountConnectionRefresh />);
    expect(view.container).toBeEmptyDOMElement();
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(updated).toHaveBeenCalledOnce();
    view.rerender(<AccountConnectionRefresh />);
    expect(updated).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener("stirling:billing-updated", updated);
  }
});
