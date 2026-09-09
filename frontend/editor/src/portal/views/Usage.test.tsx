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
  beforeEach(() => {
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
});
