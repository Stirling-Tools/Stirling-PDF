import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactElement } from "react";

// Usage renders Mantine-backed @app/ui components (e.g. the "Manage Payment"
// Button in the subscribed header), which need a MantineProvider in the tree.
const renderUsage = (ui: ReactElement) =>
  render(<MantineProvider>{ui}</MantineProvider>);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, def?: string) => def ?? key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

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
});
