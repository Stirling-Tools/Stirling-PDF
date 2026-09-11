import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactElement } from "react";

// Usage renders Mantine-backed @app/ui components (e.g. the "Manage Payment"
// Button in the subscribed header), which need a MantineProvider in the tree.
const renderUsage = (ui: ReactElement) =>
  render(<MantineProvider>{ui}</MantineProvider>);

vi.mock("react-i18next", () => {
  const t = (key: string, def?: string) => def ?? key;
  return {
    useTranslation: () => ({
      t,
      i18n: { changeLanguage: vi.fn() },
    }),
  };
});

const fetchWallet = vi.fn();
const refreshWalletCache = vi.fn();
vi.mock("@portal/api/billing", () => ({
  fetchWallet: () => fetchWallet(),
  refreshWalletCache: () => refreshWalletCache(),
}));
vi.mock("@portal/api/link", () => ({
  fetchLocalUsage: () => Promise.resolve(null),
  triggerLocalSync: () => Promise.resolve(),
}));
vi.mock("@portal/hooks/useStripePortal", () => ({
  useStripePortal: () => ({ opening: false, open: vi.fn(), error: null }),
}));
// Stub the plan views so the test doesn't depend on the full wallet shape.
vi.mock("@portal/components/billing/FreePlanView", () => ({
  FreePlanView: () => null,
}));
vi.mock("@portal/components/billing/SubscribedPlanView", () => ({
  SubscribedPlanView: () => null,
}));

import { Usage } from "@portal/views/Usage";
import {
  portalSaasSessionRestored,
  SaasSessionRequiredError,
  resetPortalSaasSessionState,
} from "@portal/auth/portalSaasSession";

describe("Usage — link-free wallet renderer", () => {
  beforeEach(() => {
    resetPortalSaasSessionState();
    fetchWallet.mockReset();
    refreshWalletCache.mockReset();
  });

  it("loads the wallet on mount and reports it via onWalletLoaded (no link gate)", async () => {
    fetchWallet.mockResolvedValue({ status: "free" });
    const onWalletLoaded = vi.fn();

    renderUsage(<Usage onWalletLoaded={onWalletLoaded} />);

    // Renders immediately (no link prompt / login) and loads unconditionally.
    expect(screen.getByText("Usage & billing")).toBeInTheDocument();
    await waitFor(() =>
      expect(onWalletLoaded).toHaveBeenCalledWith({ status: "free" }),
    );
  });

  it("works with no callbacks (SaaS passes none)", async () => {
    fetchWallet.mockResolvedValue({ status: "subscribed" });

    renderUsage(<Usage />);

    await waitFor(() => expect(fetchWallet).toHaveBeenCalledTimes(1));
  });

  it("reloads billing and clears the expired-session view after renewal", async () => {
    fetchWallet
      .mockRejectedValueOnce(new SaasSessionRequiredError())
      .mockResolvedValue({ status: "free" });
    const onWalletLoaded = vi.fn();
    renderUsage(<Usage onWalletLoaded={onWalletLoaded} />);
    await screen.findByText("Session expired");
    act(() => portalSaasSessionRestored());
    await waitFor(() =>
      expect(onWalletLoaded).toHaveBeenCalledWith({ status: "free" }),
    );
    expect(screen.queryByText("Session expired")).not.toBeInTheDocument();
    expect(fetchWallet).toHaveBeenCalledTimes(2);
  });
});
