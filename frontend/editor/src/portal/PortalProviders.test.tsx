import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";
import { PortalProviders } from "@portal/PortalProviders";
import { ServerLicenseSection } from "@portal/components/billing/ServerLicenseSection";

const { fetchAppConfig, getLicenseInfo } = vi.hoisted(() => ({
  fetchAppConfig: vi.fn(),
  getLicenseInfo: vi.fn(),
}));

vi.mock("@app/api/config", () => ({
  DEFAULT_APP_CONFIG: { enableLogin: true },
  fetchAppConfig,
}));
vi.mock("@app/services/licenseService", () => ({
  default: { getLicenseInfo },
}));
vi.mock("@app/testing/serverExperienceSimulations", () => ({
  getSimulatedLicenseInfo: () => null,
}));
vi.mock("@portal/contexts/TierContext", () => ({
  TierProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@portal/contexts/LinkContext", () => ({
  LinkProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@portal/contexts/UIContext", () => ({
  UIProvider: ({ children }: { children: ReactNode }) => children,
  useUI: () => ({ linkModalOpen: false }),
}));
vi.mock("@portal/contexts/AccountLinkContext", () => ({
  AccountLinkProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@app/contexts/CheckoutContext", () => ({
  CheckoutProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@portal/components/account-link/LinkAccountModal", () => ({
  LinkAccountModal: () => null,
}));
vi.mock("@portal/components/account-link/ConnectCallbackHost", () => ({
  ConnectCallbackHost: () => null,
}));
vi.mock("@portal/hooks/useFreeTierExhaustedPrompt", () => ({
  useFreeTierExhaustedPrompt: () => {},
}));
vi.mock("@portal/components/PortalChrome", () => ({
  PortalChrome: () => <ServerLicenseSection onSaved={() => {}} />,
}));

function renderPortal() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/processor/usage"]}>
        <MantineProvider>
          <PortalProviders />
        </MantineProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PortalProviders license loading", () => {
  beforeEach(() => {
    fetchAppConfig
      .mockReset()
      .mockResolvedValue({ isAdmin: true, enableLogin: true });
    getLicenseInfo
      .mockReset()
      .mockResolvedValue({ licenseKey: null, licenseType: "NORMAL" });
  });

  it("loads local config before fetching the license on a direct portal visit", async () => {
    let resolveConfig!: (config: {
      isAdmin: boolean;
      enableLogin: boolean;
    }) => void;
    fetchAppConfig.mockReturnValue(
      new Promise((resolve) => {
        resolveConfig = resolve;
      }),
    );
    renderPortal();
    await waitFor(() => expect(fetchAppConfig).toHaveBeenCalledTimes(1));
    expect(getLicenseInfo).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();

    resolveConfig({ isAdmin: true, enableLogin: true });
    expect(await screen.findByText("No license installed")).toBeInTheDocument();
    expect(getLicenseInfo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(
      screen.getByLabelText("License Key", {
        selector: 'input[type="password"]',
      }),
    ).not.toBeDisabled();
  });

  it("settles a failed license request and retries without leaving a spinner", async () => {
    getLicenseInfo.mockRejectedValueOnce(new Error("License request failed"));
    renderPortal();
    expect(
      await screen.findByText("License request failed"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No license installed")).toBeInTheDocument();
    expect(getLicenseInfo).toHaveBeenCalledTimes(2);
  });

  it("reports a failed config read instead of claiming no license is installed", async () => {
    fetchAppConfig.mockRejectedValueOnce(new Error("Config request failed"));
    renderPortal();
    expect(
      await screen.findByText("Config request failed"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No license installed")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();
    expect(getLicenseInfo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No license installed")).toBeInTheDocument();
    expect(getLicenseInfo).toHaveBeenCalledOnce();
  });
});
