vi.mock("@portal/queries/infrastructure", () => ({
  useFleetStats: () => ({ data: null, loading: false, error: null }),
}));
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

const renderUsage = (ui: ReactElement, entry = "/settings/billing") =>
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
const checkout = { openCheckout: vi.fn() };
let checkoutEnabled = false;
vi.mock("@app/contexts/CheckoutContext", () => ({
  useCheckoutOptional: () => (checkoutEnabled ? checkout : null),
}));
vi.mock("@portal/api/billing", () => ({
  fetchWallet: () => fetchWallet(),
  refreshWalletCache: () => refreshWalletCache(),
  fetchPaymentMethod: () => Promise.resolve(null),
  fetchBillingDetails: () => Promise.resolve(null),
  fetchInvoices: () => Promise.resolve([]),
}));
const fetchLocalUsage = vi.fn().mockResolvedValue(null);
vi.mock("@portal/api/link", () => ({
  fetchLocalUsage: () => fetchLocalUsage(),
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
    checkoutEnabled = false;
    checkout.openCheckout.mockReset();
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

  it("opens Team once for an over-capacity server and includes the actual allowance", async () => {
    checkoutEnabled = true;
    fetchWallet.mockResolvedValue({ ...walletOf("free"), role: "leader" });
    renderUsage(
      <Usage localUsersInUse={7} localUserLimit={5} />,
      "/settings/billing?upgrade=team",
    );
    await waitFor(() => expect(checkout.openCheckout).toHaveBeenCalledTimes(1));
    expect(checkout.openCheckout).toHaveBeenCalledWith(
      "server",
      expect.objectContaining({
        combinedChoose: true,
        minimumSeats: 7,
        capacityNotice: { users: 7, limit: 5 },
      }),
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/settings/billing",
    );
    expect(screen.getByTestId("location")).not.toHaveTextContent("upgrade=");
  });

  it.each([
    ["within allowance", 4, 5, false, "leader"],
    ["grandfathered allowance", 7, 10, false, "leader"],
    ["unknown or uncapped limit", 7, null, false, "leader"],
    ["active Team", 7, 5, true, "leader"],
    ["member", 7, 5, false, "member"],
  ] as const)(
    "does not prompt a server with %s",
    async (_label, users, limit, held, role) => {
      checkoutEnabled = true;
      fetchWallet.mockResolvedValue({
        ...walletOf("free"),
        role,
        team: { held, licensedUsers: 100 },
      });
      renderUsage(
        <Usage localUsersInUse={users} localUserLimit={limit} />,
        "/settings/billing?upgrade=team",
      );
      await waitFor(() =>
        expect(screen.getByTestId("location")).not.toHaveTextContent(
          "upgrade=",
        ),
      );
      expect(checkout.openCheckout).not.toHaveBeenCalled();
    },
  );

  it("does not prompt holders of an installed Server license", async () => {
    checkoutEnabled = true;
    fetchWallet.mockResolvedValue({ ...walletOf("free"), role: "leader" });
    renderUsage(
      <Usage
        localUsersInUse={7}
        localUserLimit={5}
        serverPlan={{ licenseType: "SERVER", maxUsers: 0, usersInUse: 7 }}
      />,
      "/settings/billing?upgrade=team",
    );
    await waitFor(() =>
      expect(screen.getByTestId("location")).not.toHaveTextContent("upgrade="),
    );
    expect(checkout.openCheckout).not.toHaveBeenCalled();
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
      "/settings/billing",
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
    renderUsage(<Usage />, "/settings/billing?procurement=start&source=sales");
    await waitFor(() => expect(procurement[action]).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/settings/billing?source=sales",
      ),
    );
    if (stage) expect(procurement.onExploreEnterprise).not.toHaveBeenCalled();
  });

  it("keeps a failed snapshot's start request pending instead of creating another deal", async () => {
    procurement.loadError = "Snapshot unavailable";
    fetchWallet.mockResolvedValue({ ...walletOf("free"), role: "leader" });
    renderUsage(<Usage />, "/settings/billing?procurement=start");
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
    renderUsage(<Usage />, "/settings/billing?procurement=start");
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

it("does not request instance-local usage on SaaS", async () => {
  fetchWallet.mockResolvedValue(freeWallet);
  fetchLocalUsage.mockClear();
  renderUsage(<Usage />);
  await waitFor(() => expect(screen.getByText("Free")).toBeInTheDocument());
  expect(fetchLocalUsage).not.toHaveBeenCalled();
});

it("requests pending usage for a self-hosted instance", async () => {
  fetchWallet.mockResolvedValue(freeWallet);
  fetchLocalUsage.mockClear();
  renderUsage(<Usage localUsersInUse={null} />);
  await waitFor(() => expect(fetchLocalUsage).toHaveBeenCalled());
});
