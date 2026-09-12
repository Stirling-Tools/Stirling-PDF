import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { UseAccountLink } from "@portal/hooks/useAccountLink";

const state = vi.hoisted(() => ({
  fetchInstances: vi.fn(),
  revokeInstance: vi.fn(),
  openLinkModal: vi.fn(),
  refresh: vi.fn(),
  unlink: vi.fn(),
  status: { linked: true, name: "Production" } as UseAccountLink["status"],
  statusError: null as string | null,
  email: "owner@example.com" as string | null,
}));
vi.mock("@portal/hooks/useLinkedAccountEmail", () => ({
  useLinkedAccountEmail: () => state.email,
}));
vi.mock("@portal/contexts/AccountLinkContext", () => ({
  useAccountLinkContext: () => ({
    loginConfigured: true,
    status: state.status,
    statusError: state.statusError,
    phase: "idle",
    error: null,
    unlink: state.unlink,
    refresh: state.refresh,
  }),
}));
vi.mock("@portal/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal: state.openLinkModal }),
}));
vi.mock("@portal/api/link", () => ({
  fetchInstances: state.fetchInstances,
  revokeInstance: state.revokeInstance,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
        String(values?.[key] ?? ""),
      ),
    i18n: { language: "en-US" },
  }),
}));

import { AccountLinkPanel } from "@portal/components/account-link/AccountLinkPanel";

const instance = {
  instanceId: 42,
  deviceId: "device-42",
  name: "Production",
  createdAt: null,
  lastSeenAt: null,
  revoked: false,
};
function mount() {
  return render(
    <MantineProvider>
      <AccountLinkPanel />
    </MantineProvider>,
  );
}

describe("Self-hosted account connection", () => {
  beforeEach(() => {
    state.fetchInstances.mockReset().mockResolvedValue([instance]);
    state.revokeInstance.mockReset().mockResolvedValue(undefined);
    state.openLinkModal.mockReset();
    state.refresh.mockReset();
    state.unlink.mockReset();
    state.status = { linked: true, name: "Production" };
    state.statusError = null;
    state.email = "owner@example.com";
  });

  it("shows instance names and only revokes after confirmation", async () => {
    state.fetchInstances.mockResolvedValue([
      instance,
      { ...instance, instanceId: 99, name: "Old server", revoked: true },
    ]);
    mount();
    expect(
      await screen.findByRole("heading", { name: "Production", level: 3 }),
    ).toBeVisible();
    expect(screen.getByText("device-42")).not.toBeVisible();
    expect(screen.queryByText("Old server")).not.toBeInTheDocument();
    expect(screen.queryByText(/Removed connections/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Signed in to Stirling Cloud as"),
    ).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove connection" }));
    const dialog = screen.getByRole("dialog", {
      name: "Remove Production?",
    });
    expect(state.revokeInstance).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(state.revokeInstance).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove connection" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove connection",
      }),
    );
    await waitFor(() => expect(state.revokeInstance).toHaveBeenCalledWith(42));
  });

  it("keeps the existing connection flow for a disconnected instance", async () => {
    state.status = { linked: false, name: null };
    await act(async () => {
      mount();
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Connect your Stirling account" }),
    );
    expect(state.openLinkModal).toHaveBeenCalledOnce();
    expect(state.fetchInstances).not.toHaveBeenCalled();
  });

  it("does not offer connection actions before status is known", async () => {
    state.status = null;
    await act(async () => {
      mount();
    });
    expect(
      screen.getByRole("status", { name: "Checking account connection" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Connect your|Disconnect this/ }),
    ).not.toBeInTheDocument();
    expect(state.fetchInstances).not.toHaveBeenCalled();
  });

  it("offers a status retry without treating a failed read as disconnected", async () => {
    state.status = null;
    state.statusError = "Server unavailable";
    await act(async () => {
      mount();
    });
    expect(
      screen.getByText("Couldn’t check the account connection"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Connect your Stirling account" }),
    ).not.toBeInTheDocument();
  });
});
