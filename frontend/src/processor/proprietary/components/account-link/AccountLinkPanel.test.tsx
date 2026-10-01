import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { UseAccountLink } from "@app/portal/hooks/useAccountLink";

const state = vi.hoisted(() => ({
  fetchInstances: vi.fn(),
  revokeInstance: vi.fn(),
  openLinkModal: vi.fn(),
  refresh: vi.fn(),
  unlink: vi.fn(),
  status: { linked: true, name: "Production" } as UseAccountLink["status"],
  statusError: null as string | null,
  email: "owner@example.com" as string | null,
  isOwner: true,
}));
vi.mock("@app/auth/context", () => ({
  useAuth: () => ({ user: { orgOwner: state.isOwner } }),
}));
vi.mock("@app/portal/hooks/useAccountLinkOwner", () => ({
  useAccountLinkOwner: () => state.isOwner,
}));
vi.mock("@app/portal/contexts/LinkContext", () => ({
  useLink: () => ({ isLinked: state.status?.linked ?? false }),
}));
vi.mock("@app/portal/hooks/useLinkedAccountEmail", () => ({
  useLinkedAccountEmail: () => state.email,
}));
vi.mock("@app/portal/contexts/AccountLinkContext", () => ({
  useAccountLinkOptional: () => null,
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
vi.mock("@app/portal/contexts/UIContext", () => ({
  useUI: () => ({ openLinkModal: state.openLinkModal }),
}));
vi.mock("@app/portal/api/link", () => ({
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

import { SaasSessionRequiredError } from "@app/portal/auth/portalSaasSession";
import { AccountLinkPanel } from "@app/portal/components/account-link/AccountLinkPanel";

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
    vi.stubEnv("VITE_SAAS_FRONTEND_URL", "https://cloud.example/app/");
    state.fetchInstances.mockReset().mockResolvedValue([instance]);
    state.revokeInstance.mockReset().mockResolvedValue(undefined);
    state.openLinkModal.mockReset();
    state.refresh.mockReset();
    state.unlink.mockReset();
    state.status = { linked: true, name: "Production" };
    state.statusError = null;
    state.isOwner = true;
    state.email = "owner@example.com";
  });

  afterEach(() => vi.unstubAllEnvs());

  it("opens cloud management at the configured app path", async () => {
    await act(async () => {
      mount();
    });
    const manage = screen.getByRole("link", { name: "Manage on stirling.com" });
    expect(manage).toHaveAttribute(
      "href",
      "https://cloud.example/app/settings/account-link",
    );
    expect(manage).toHaveAttribute("target", "_blank");
    expect(manage).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("identifies this server by device ID while retaining another server with the same name", async () => {
    state.status = { linked: true, deviceId: "device-42" };
    state.fetchInstances.mockResolvedValue([
      instance,
      { ...instance, instanceId: 43, deviceId: "device-43" },
    ]);
    mount();
    expect(
      await screen.findByRole("heading", { name: "Production", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("heading", { name: "Production", level: 3 }),
    ).toHaveLength(1);
    expect(screen.getByText("device-43")).toBeInTheDocument();
    expect(screen.queryByText("device-42")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Other connected instances" }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Remove connection" }),
    ).toHaveLength(1);
  });

  it("shows an empty other-instances list when this is the only connected server", async () => {
    state.status = { linked: true, deviceId: "device-42" };
    mount();
    expect(
      await screen.findByRole("heading", { name: "Production", level: 2 }),
    ).toBeVisible();
    expect(screen.getByText("No other connected instances")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Remove connection" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disconnect this instance" }),
    ).toBeVisible();
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

  it("only disconnects this instance after confirmation", async () => {
    mount();
    await screen.findByRole("heading", { name: "Production", level: 3 });
    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect this instance" }),
    );
    expect(state.unlink).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(state.unlink).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect this instance" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Disconnect this instance",
      }),
    );
    expect(state.unlink).toHaveBeenCalledOnce();
  });

  it("shows the connection time until a device has been seen", async () => {
    state.fetchInstances.mockResolvedValue([
      { ...instance, createdAt: "2026-09-14T10:00:00Z" },
    ]);
    mount();
    expect(await screen.findByText(/^Connected: /)).toBeVisible();
    expect(screen.queryByText(/^Last seen:/)).not.toBeInTheDocument();
  });

  it("shows actual device activity when available", async () => {
    state.fetchInstances.mockResolvedValue([
      { ...instance, lastSeenAt: "2026-09-14T10:30:00Z" },
    ]);
    mount();
    expect(await screen.findByText(/^Last seen: /)).toBeVisible();
    expect(screen.queryByText(/^Connected: /)).not.toBeInTheDocument();
  });

  it("ages the just-connected label without another request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T10:00:00Z"));
    state.fetchInstances.mockResolvedValue([
      { ...instance, createdAt: "2026-09-14T10:00:00Z" },
    ]);
    try {
      await act(async () => {
        mount();
      });
      expect(screen.getByText("Connected just now")).toBeVisible();
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.queryByText("Connected just now")).not.toBeInTheDocument();
      expect(screen.getByText(/^Connected: /)).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
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

  it("leaves session recovery to the shell instead of offering an ineffective data retry", async () => {
    state.status = { linked: true, name: "Production" };
    state.fetchInstances.mockRejectedValue(new SaasSessionRequiredError());
    mount();
    expect(
      await screen.findByText(
        "Connected instances will appear after you renew billing access.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText("Couldn’t load connected instances")).toBeNull();
  });
});

it("does not mount account management or fetch team instances for a non-owner", () => {
  state.isOwner = false;
  state.fetchInstances.mockClear();
  mount();
  expect(screen.queryByText("Account connection")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  expect(state.fetchInstances).not.toHaveBeenCalled();
});
