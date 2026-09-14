vi.mock("@app/portal/queries/infrastructure", () => ({
  useFleetStats: () => ({ data: null, loading: false, error: null }),
}));
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
vi.mock("@app/portal/api/billing", () => ({
  fetchWallet: () => fetchWallet(),
  refreshWalletCache: () => refreshWalletCache(),
}));
vi.mock("@app/portal/api/link", () => ({
  fetchLocalUsage: () => Promise.resolve(null),
  triggerLocalSync: () => Promise.resolve(),
}));
vi.mock("@app/portal/hooks/useStripePortal", () => ({
  useStripePortal: () => ({ opening: false, open: vi.fn(), error: null }),
}));
// Stub the plan views so the test doesn't depend on the full wallet shape.
vi.mock("@app/portal/components/billing/FreePlanView", () => ({
  FreePlanView: () => null,
}));
vi.mock("@app/portal/components/billing/SubscribedPlanView", () => ({
  SubscribedPlanView: () => null,
}));

import { Usage } from "@app/portal/views/Usage";
import {
  portalSaasSessionRestored,
  SaasSessionRequiredError,
  resetPortalSaasSessionState,
} from "@app/portal/auth/portalSaasSession";

describe("Usage — link-free wallet renderer", () => {
  // Enough of a wallet for BillingScreen to render; the bare {status} fixture predates it.
  const walletOf = (status: string) => ({
    status,
    role: "member",
    currency: "usd",
    freeAllowance: 500,
    freeRemaining: 500,
    spendUnitsThisPeriod: 0,
    docsProcessedThisPeriod: 0,
    sizeMultiplierPdfsThisPeriod: 0,
    estimatedBillMinor: 0,
    pricePerDocMinor: 1,
    billingPeriodStart: "2026-09-01T00:00:00",
    billingPeriodEnd: "2026-10-01T00:00:00",
    team: { held: false, licensedUsers: null, usersInUse: 1 },
    processor: { active: false },
  });

  beforeEach(() => {
    resetPortalSaasSessionState();
    fetchWallet.mockReset();
    refreshWalletCache.mockReset();
  });

  it("loads the wallet on mount and reports it via onWalletLoaded (no link gate)", async () => {
    fetchWallet.mockResolvedValue(walletOf("free"));
    const onWalletLoaded = vi.fn();

    renderUsage(<Usage onWalletLoaded={onWalletLoaded} />);

    // Renders immediately (no link prompt / login) and loads unconditionally.
    expect(screen.getByText("Usage & Billing")).toBeInTheDocument();
    await waitFor(() =>
      expect(onWalletLoaded).toHaveBeenCalledWith(walletOf("free")),
    );
  });

  it("works with no callbacks (SaaS passes none)", async () => {
    fetchWallet.mockResolvedValue(walletOf("subscribed"));

    renderUsage(<Usage />);

    await waitFor(() => expect(fetchWallet).toHaveBeenCalledTimes(1));
  });

  it("uses the shell recovery banner without duplicating it in the billing screen", async () => {
    fetchWallet.mockRejectedValue(new SaasSessionRequiredError());
    await act(async () => {
      renderUsage(<Usage sessionRecoveryInShell />);
    });
    expect(fetchWallet).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Session expired")).not.toBeInTheDocument();
  });

  it("reloads billing and clears the expired-session view after renewal", async () => {
    fetchWallet
      .mockRejectedValueOnce(new SaasSessionRequiredError())
      .mockResolvedValue(walletOf("free"));
    const onWalletLoaded = vi.fn();
    renderUsage(<Usage onWalletLoaded={onWalletLoaded} />);
    await screen.findByText("Session expired");
    act(() => portalSaasSessionRestored());
    await waitFor(() =>
      expect(onWalletLoaded).toHaveBeenCalledWith(walletOf("free")),
    );
    expect(screen.queryByText("Session expired")).not.toBeInTheDocument();
    expect(fetchWallet).toHaveBeenCalledTimes(2);
  });
});
