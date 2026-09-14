import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { AccountLinkNotice } from "@app/components/AccountLinkNotice";
import { handleHttpError } from "@app/services/httpErrorHandler";
import { clearAccountLinkBlock } from "@app/services/accountLinkBlock";
import type { ConnectionConfig } from "@app/services/connectionModeService";

const {
  auth,
  alert,
  dismissToast,
  openExternal,
  getCurrentConfig,
  listeners,
  get,
} = vi.hoisted(() => ({
  auth: { isAdmin: true, loading: false },
  alert: vi.fn(),
  dismissToast: vi.fn(),
  openExternal: vi.fn(),
  getCurrentConfig: vi.fn(),
  get: vi.fn(),
  listeners: new Set<(config: ConnectionConfig) => void>(),
}));

vi.mock("@app/auth", () => ({ useAuth: () => auth }));
vi.mock("@app/components/toast", () => ({ alert, dismissToast }));
vi.mock("@app/platform/openExternal", () => ({ openExternal }));
vi.mock("@app/services/apiClient", () => ({ default: { get } }));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentConfig,
    subscribeToModeChanges: (listener: (config: ConnectionConfig) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  },
}));
vi.mock("@app/services/specialErrorToasts", () => ({
  showSpecialErrorToast: vi.fn().mockReturnValue(false),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
vi.mock("@app/ui", async () => ({
  ...(await import("@app/ui/Button")),
  ...(await import("@app/ui/Modal")),
  ...(await import("@app/ui/Banner")),
}));

function config(
  mode: ConnectionConfig["mode"] = "selfhosted",
  url = "https://server.example/stirling/",
): ConnectionConfig {
  return { mode, server_config: { url }, lock_connection_mode: false };
}

function LocationProbe() {
  return <output>{useLocation().pathname}</output>;
}

async function mount(path = "/editor") {
  const view = render(
    <MantineProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <AccountLinkNotice />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
  await act(async () => {});
  return view;
}

async function exhaust(source: "foreground" | "background" = "foreground") {
  await act(async () => {
    expect(
      await handleHttpError({
        isAxiosError: true,
        config: { accountLinkBlockSource: source },
        response: {
          status: 402,
          data: {
            error: "ACCOUNT_LINK_REQUIRED",
            reason: "FREE_TIER_EXHAUSTED",
          },
        },
      }),
    ).toBe(true);
  });
}

describe("desktop self-hosted account-link triggers", () => {
  beforeEach(() => {
    clearAccountLinkBlock();
    vi.clearAllMocks();
    listeners.clear();
    auth.isAdmin = true;
    getCurrentConfig.mockResolvedValue(config());
    openExternal.mockResolvedValue(undefined);
    get.mockResolvedValue({
      data: {
        linked: false,
        remainingUnits: 0,
        grantUnits: 500,
        periodEnd: "2026-10-01T00:00:00",
      },
    });
  });

  it.each(["/editor", "/settings/billing", "/settings/account-link"])(
    "opens server billing externally from %s, preserving the deployment subpath",
    async (path) => {
      await mount(path);
      await exhaust();
      expect(screen.getByRole("dialog")).toBeTruthy();
      fireEvent.click(
        screen.getByRole("button", { name: "Link account for more credits" }),
      );
      expect(openExternal).toHaveBeenCalledWith(
        "https://server.example/stirling/settings/billing",
      );
      expect(screen.getByRole("status").textContent).toBe(path);
    },
  );

  it("keeps background exhaustion silent", async () => {
    await mount();
    await exhaust("background");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(alert).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("does not reopen a dismissed modal for repeated exhaustion", async () => {
    await mount();
    await exhaust();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await exhaust();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });

  it("tells members to contact their server administrator", async () => {
    auth.isAdmin = false;
    await mount();
    await exhaust();
    expect(
      screen.getByRole("dialog", { name: "Ask your server administrator" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Link account for more credits" }),
    ).toBeNull();
    expect(openExternal).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it.each(["saas", "local"] as const)(
    "stays hidden in %s mode",
    async (mode) => {
      getCurrentConfig.mockResolvedValue(config(mode));
      await mount();
      await exhaust();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(alert).not.toHaveBeenCalled();
      expect(openExternal).not.toHaveBeenCalled();
    },
  );

  it("clears exhaustion when switching servers or leaving self-hosted mode", async () => {
    await mount();
    await exhaust("background");
    act(() =>
      listeners.forEach((listener) =>
        listener(config("selfhosted", "https://other.example")),
      ),
    );
    expect(alert).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    await exhaust();
    fireEvent.click(
      screen.getByRole("button", { name: "Link account for more credits" }),
    );
    expect(openExternal).toHaveBeenLastCalledWith(
      "https://other.example/settings/billing",
    );
    act(() => listeners.forEach((listener) => listener(config("saas"))));
    act(() => listeners.forEach((listener) => listener(config())));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not let delayed initial config overwrite a mode change", async () => {
    let finish: (value: ConnectionConfig) => void = () => {};
    getCurrentConfig.mockReturnValue(
      new Promise<ConnectionConfig>((resolve) => {
        finish = resolve;
      }),
    );
    await mount();
    act(() => listeners.forEach((listener) => listener(config("local"))));
    await act(async () => finish(config()));
    await exhaust();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });

  it("dismisses the notice when the exhaustion state is cleared", async () => {
    await mount();
    await exhaust();
    act(() => clearAccountLinkBlock());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });

  it("offers recovery instructions if the system browser cannot open", async () => {
    openExternal.mockRejectedValue(new Error("Shell unavailable"));
    await mount();
    await exhaust();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Link account for more credits" }),
      ),
    );
    expect(alert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: "error",
        title: expect.stringContaining("Could not open your browser"),
      }),
    );
  });

  it.each([
    { linked: true, remainingUnits: 0 },
    { linked: false, remainingUnits: 500 },
  ])("refreshes recovery when returning from the browser: %j", async (data) => {
    await mount();
    await exhaust();
    expect(get).toHaveBeenCalledWith(
      "https://server.example/stirling/api/v1/account-link/status",
      expect.objectContaining({ suppressErrorToast: true }),
    );
    get.mockResolvedValue({ data });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the notice when recovery checks fail", async () => {
    get.mockRejectedValue(new Error("Offline"));
    await mount();
    await exhaust();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
