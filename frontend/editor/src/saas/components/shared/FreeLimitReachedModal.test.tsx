import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { Wallet } from "@app/hooks/useWallet";

// The modal resolves through the saas cascade to the cloud impl
// (src/cloud/components/shared/FreeLimitReachedModal.tsx). It calls
// @app/hooks/useWallet directly and bails out (renders null) until a wallet
// resolves, so the only mock the smoke test needs is the wallet hook — the
// rest of the subtree (AnimatedSlideBackground, FreeMeterPanel, MUI icon) is
// pure CSS/SVG/divs and renders fine under jsdom.
const wallet: Wallet = {
  teamId: 1,
  status: "free",
  role: "leader",
  billingPeriodStart: "2026-06-01",
  billingPeriodEnd: "2026-06-30",
  billableUsed: 500,
  billableLimit: 500,
  freeAllowance: 500,
  freeRemaining: 0,
  pricePerDocMinor: 2,
  currency: "usd",
  estimatedBillMinor: 0,
  capUsd: null,
  noCap: false,
  stripeSubscriptionId: null,
  spendUnitsThisPeriod: 0,
  categoryBreakdown: { api: 0, ai: 0, automation: 0 },
  members: [],
  recent: [],
};

const useWalletMock = vi.fn();

vi.mock("@app/hooks/useWallet", () => ({
  useWallet: () => useWalletMock(),
}));

// navigateToSettings is only invoked on CTA click; stub it so the smoke test
// never touches real settings/router plumbing.
vi.mock("@app/utils/settingsNavigation", () => ({
  navigateToSettings: vi.fn(),
}));

import { FreeLimitReachedModal } from "@app/components/shared/FreeLimitReachedModal";

const renderModal = () =>
  render(
    <MantineProvider>
      <FreeLimitReachedModal onClose={vi.fn()} />
    </MantineProvider>,
  );

describe("FreeLimitReachedModal — render smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders its primary CTA when the wallet has resolved", () => {
    useWalletMock.mockReturnValue({
      wallet,
      loading: false,
      error: null,
      refetch: vi.fn(),
      markSubscribed: vi.fn(),
      updateCap: vi.fn(),
      openPortal: vi.fn(),
    });

    renderModal();

    // i18n is stubbed in setupTests to echo the key, so the CTA shows as its
    // translation key. Asserting on it confirms the modal mounted through the
    // Mantine portal without throwing.
    expect(screen.getByText("plan.freeLimit.cta")).toBeInTheDocument();
    expect(screen.getByText("plan.freeLimit.dismiss")).toBeInTheDocument();
  });

  it("renders nothing while the wallet is still loading", () => {
    useWalletMock.mockReturnValue({
      wallet: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
      markSubscribed: vi.fn(),
      updateCap: vi.fn(),
      openPortal: vi.fn(),
    });

    renderModal();

    // The modal holds back until the wallet lands, so no CTA is in the DOM.
    expect(screen.queryByText("plan.freeLimit.cta")).not.toBeInTheDocument();
  });
});
