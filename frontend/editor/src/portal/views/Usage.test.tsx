import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactElement } from "react";
import { StrictMode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { UIProvider } from "@portal/contexts/UIContext";
import type { ProcurementSnapshot } from "@portal/api/procurement";

// Usage renders Mantine-backed @app/ui components (e.g. the "Manage Payment"
// Button in the subscribed header), which need a MantineProvider in the tree.
function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

const renderUsage = (ui: ReactElement, entry = "/processor/usage") =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[entry]}>
        <UIProvider>
          <MantineProvider>
            {ui}
            <Location />
          </MantineProvider>
        </UIProvider>
      </MemoryRouter>
    </StrictMode>,
  );

const translate = (key: string, def?: string) => def ?? key;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: translate,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchWallet = vi.fn();
const refreshWalletCache = vi.fn();
const bundleFlow = { status: "none", refresh: vi.fn() };
vi.mock("@portal/hooks/useBundleFlowState", () => ({
  useBundleFlowState: () => bundleFlow,
}));
const procurement = {
  isLinked: true,
  loading: false,
  loadError: null as string | null,
  error: null,
  open: false,
  started: false,
  stage: null as ProcurementSnapshot["stage"],
  retry: vi.fn(),
  onExploreEnterprise: vi.fn(),
  onStartTrial: vi.fn(),
  setOpen: vi.fn(),
};
vi.mock("@portal/components/procurement/useProcurement", () => ({
  useProcurement: () => procurement,
}));
vi.mock("@portal/components/procurement/ProcurementBanner", () => ({
  ControlledDealStatusHero: ({ readOnly }: { readOnly: boolean }) => (
    <div data-testid="procurement-summary">
      {readOnly ? "Read-only deal" : "Enterprise deal"}
    </div>
  ),
}));
vi.mock("@portal/components/procurement/ProcurementFlow", () => ({
  ProcurementFlow: () => <div data-testid="procurement-flow" />,
}));
vi.mock("@portal/api/fleetStats", () => ({
  fetchFleetStats: () => Promise.resolve(null),
}));
vi.mock("@portal/api/users", () => ({
  fetchAdminEmail: () => Promise.resolve(null),
}));
vi.mock("@app/contexts/CheckoutContext", () => ({
  useCheckoutOptional: () => null,
}));
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
  FreePlanView: ({
    step,
    onActivationClosed,
  }: {
    step?: string | null;
    onActivationClosed?: () => void;
  }) =>
    step ? (
      <div data-testid="activation-step">
        {step}
        <button onClick={onActivationClosed}>Close activation</button>
      </div>
    ) : null,
}));
vi.mock("@portal/components/billing/SubscribedPlanView", () => ({
  SubscribedPlanView: () => null,
}));

import { Usage } from "@portal/views/Usage";
import { BillingScreen } from "@app/billing/BillingScreen";
import { freeWallet } from "@app/billing/walletFixtures";

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
    bundleFlow.status = "none";
    bundleFlow.refresh.mockReset();
    fetchWallet.mockReset();
    refreshWalletCache.mockReset();
    procurement.loading = false;
    procurement.loadError = null;
    procurement.started = false;
    procurement.stage = null;
    procurement.onExploreEnterprise.mockReset();
    procurement.onStartTrial.mockReset();
    procurement.setOpen.mockReset();
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

    await waitFor(() => expect(fetchWallet).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "License Key" }),
    ).not.toBeInTheDocument();
  });

  it("places local license management at the end of billing and refreshes after a save", async () => {
    fetchWallet.mockResolvedValue(walletOf("free"));
    refreshWalletCache.mockResolvedValue(undefined);
    renderUsage(
      <Usage
        renderLicenseSection={(onSaved) => (
          <button onClick={onSaved}>Activate local license</button>
        )}
      />,
    );
    await screen.findByText("This cycle");
    const sections = Array.from(document.querySelectorAll(".billing-sec")).map(
      (section) => section.id,
    );
    expect(sections).toEqual(["ub-plan", "ub-usage", "ub-license"]);
    const scrollIntoView = vi.fn();
    document.getElementById("ub-license")!.scrollIntoView = scrollIntoView;
    fireEvent.click(screen.getByRole("button", { name: "License Key" }));
    expect(scrollIntoView).toHaveBeenCalled();
    fetchWallet.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: "Activate local license" }),
    );
    await waitFor(() => expect(fetchWallet).toHaveBeenCalledTimes(1));
    expect(refreshWalletCache).toHaveBeenCalledTimes(1);
  });

  it("keeps the license section and navigation after payment and invoices", () => {
    renderUsage(
      <BillingScreen
        wallet={freeWallet}
        paymentSection={<div>Payment details</div>}
        invoicesSection={<div>Invoices</div>}
        licenseSection={<div>License details</div>}
      />,
    );
    expect(
      Array.from(
        document.querySelectorAll(".billing-sec"),
        (section) => section.id,
      ),
    ).toEqual(["ub-plan", "ub-usage", "ub-pay", "ub-inv", "ub-license"]);
    expect(
      Array.from(
        document.querySelectorAll(".billing-card__chip"),
        (chip) => chip.textContent,
      ),
    ).toEqual(["Plan", "Usage", "Payment", "Invoices", "License Key"]);
  });

  it.each([
    ["none", "Switch on the Processor", "choose"],
    ["quote", "View quote", "prepay"],
    ["invoice", "Pay invoice to complete", "prepay"],
  ])("uses the Processor row to resume %s", async (status, label, step) => {
    bundleFlow.status = status;
    fetchWallet.mockResolvedValue({
      ...walletOf("free"),
      role: "leader",
      teamId: 42,
    });
    renderUsage(<Usage />);
    const action = await screen.findByRole("button", { name: label });
    expect(action.closest(".billing-meter")).toHaveTextContent("Processor");
    expect(screen.getAllByRole("button", { name: label })).toHaveLength(1);
    if (status !== "none")
      expect(
        screen.queryByRole("button", { name: "Switch on the Processor" }),
      ).not.toBeInTheDocument();
    fireEvent.click(action);
    expect(screen.getByTestId("activation-step")).toHaveTextContent(step);
    fireEvent.click(screen.getByRole("button", { name: "Close activation" }));
    expect(bundleFlow.refresh).toHaveBeenCalledTimes(1);
  });

  it("withholds a quote resume action from members", async () => {
    bundleFlow.status = "quote";
    fetchWallet.mockResolvedValue(walletOf("free"));
    renderUsage(<Usage />);
    await screen.findByText("This cycle");
    expect(
      screen.queryByRole("button", { name: "View quote" }),
    ).not.toBeInTheDocument();
  });

  it("keeps local license management available when the cloud wallet cannot load", async () => {
    fetchWallet.mockRejectedValue(new Error("Wallet unavailable"));
    renderUsage(
      <Usage renderLicenseSection={() => <div>Local license form</div>} />,
    );
    await screen.findByText("Wallet unavailable");
    expect(screen.getByText("Local license form")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "License Key" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Plan" }),
    ).not.toBeInTheDocument();
  });

  it("starts procurement from the billing CTA without leaving Usage", async () => {
    fetchWallet.mockResolvedValue({ ...walletOf("free"), role: "leader" });
    renderUsage(<Usage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Get an enterprise quote" }),
    );
    expect(procurement.onExploreEnterprise).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/processor/usage",
    );
  });

  it.each([
    [null, "onExploreEnterprise"],
    ["exploring", "onStartTrial"],
    ["trial", "setOpen"],
    ["quote", "setOpen"],
    ["security", "setOpen"],
    ["procurement", "setOpen"],
    ["active", "setOpen"],
  ] as const)("resumes %s once from a sales link", async (stage, action) => {
    procurement.stage = stage;
    procurement.started = stage !== null;
    fetchWallet.mockResolvedValue({ ...walletOf("free"), role: "leader" });
    renderUsage(<Usage />, "/processor/usage?procurement=start&source=sales");
    await waitFor(() => expect(procurement[action]).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/processor/usage?source=sales",
    );
    if (stage) expect(procurement.onExploreEnterprise).not.toHaveBeenCalled();
  });

  it("keeps a failed snapshot's start request pending instead of creating another deal", async () => {
    procurement.loadError = "Snapshot unavailable";
    fetchWallet.mockResolvedValue({ ...walletOf("free"), role: "leader" });
    renderUsage(<Usage />, "/processor/usage?procurement=start");
    await screen.findByText("The full PDF Editor.");
    expect(screen.getByText("Snapshot unavailable")).toBeInTheDocument();
    expect(procurement.onExploreEnterprise).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "procurement=start",
    );
    expect(
      screen.queryByRole("button", { name: "Get an enterprise quote" }),
    ).not.toBeInTheDocument();
  });

  it("anchors an existing deal before Plan and connects its jump button", async () => {
    procurement.started = true;
    procurement.stage = "trial";
    fetchWallet.mockResolvedValue({ ...walletOf("free"), role: "leader" });
    const scroll = vi.fn();
    renderUsage(<Usage />);
    await screen.findByText("The full PDF Editor.");
    const section = screen.getByRole("region", { name: "Procurement" });
    section.scrollIntoView = scroll;
    expect(section.nextElementSibling?.id).toBe("ub-plan");
    fireEvent.click(screen.getByRole("button", { name: "Procurement" }));
    expect(scroll).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Get an enterprise quote" }),
    ).not.toBeInTheDocument();
  });

  it("shows members the deal without starting or mounting its mutation dialogs", async () => {
    procurement.started = true;
    procurement.stage = "trial";
    fetchWallet.mockResolvedValue(walletOf("free"));
    renderUsage(<Usage />, "/processor/usage?procurement=start");
    await screen.findByText("The full PDF Editor.");
    expect(screen.getByText("Read-only deal")).toBeInTheDocument();
    expect(screen.queryByTestId("procurement-flow")).not.toBeInTheDocument();
    expect(procurement.setOpen).not.toHaveBeenCalled();
  });

  it("keeps the deal visible if the wallet fails", async () => {
    procurement.started = true;
    fetchWallet.mockRejectedValue(new Error("Wallet unavailable"));
    renderUsage(<Usage />);
    await screen.findByText("Wallet unavailable");
    expect(
      screen.getByRole("region", { name: "Procurement" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Plan" }),
    ).not.toBeInTheDocument();
  });
});
