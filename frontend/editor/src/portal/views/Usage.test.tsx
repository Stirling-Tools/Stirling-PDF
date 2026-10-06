vi.mock("@app/portal/queries/infrastructure", () => ({
  useFleetStats: () => ({ data: null, loading: false, error: null }),
}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactElement } from "react";
import { StrictMode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UIProvider } from "@app/portal/contexts/UIContext";
import { baseQueryOptions } from "@app/query/queryClient";
import {
  resetTabVisibility,
  setTabHidden,
} from "@app/tests/utils/tabVisibility";
import type { ProcurementSnapshot } from "@app/portal/api/procurement";
import type { LegacyBillingState } from "@app/types/legacyBilling";
import { formatPeriodDate } from "@app/billing";

const fetchCheckoutPricing = vi.hoisted(() => vi.fn());
vi.mock("@app/portal/billing/stripe", () => ({ fetchCheckoutPricing }));

const legacyBilling: LegacyBillingState = {
  subscriptions: [],
  loading: false,
  loadError: false,
  opening: false,
  portalError: false,
  refresh: vi.fn(),
  openPortal: vi.fn(),
};
vi.mock("@app/hooks/useLegacySubscriptions", () => ({
  useLegacySubscriptions: () => legacyBilling,
}));

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

// The app's own query defaults, so a test can't pass on a library default the
// app overrides - staleTime and refetchOnWindowFocus both govern this page.
const renderUsage = (ui: ReactElement, entry = "/settings/billing") =>
  render(
    <StrictMode>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: baseQueryOptions } })
        }
      >
        <MemoryRouter initialEntries={[entry]}>
          <UIProvider>
            <MantineProvider>
              {ui}
              <Location />
            </MantineProvider>
          </UIProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );

const translate = (
  key: string,
  def?: string,
  values?: Record<string, unknown>,
) =>
  (def ?? key).replace(/\{\{(\w+)\}\}/g, (match, name) =>
    values?.[name] == null ? match : String(values[name]),
  );

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: translate,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const fetchWallet = vi.fn();
const refreshWalletCache = vi.fn();
const bundleFlow = { status: "none", refresh: vi.fn() };
vi.mock("@app/portal/hooks/useBundleFlowState", () => ({
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
vi.mock("@app/portal/components/procurement/useProcurement", () => ({
  useProcurement: () => procurement,
}));
vi.mock("@app/portal/components/procurement/ProcurementBanner", () => ({
  ControlledDealStatusHero: ({ readOnly }: { readOnly: boolean }) => (
    <div data-testid="procurement-summary">
      {readOnly ? "Read-only deal" : "Enterprise deal"}
    </div>
  ),
}));
vi.mock("@app/portal/components/procurement/ProcurementFlow", () => ({
  ProcurementFlow: () => <div data-testid="procurement-flow" />,
}));
vi.mock("@app/portal/api/fleetStats", () => ({
  fetchFleetStats: () => Promise.resolve(null),
}));
vi.mock("@app/portal/api/users", () => ({
  fetchAdminEmail: () => Promise.resolve(null),
}));
const checkout = { openCheckout: vi.fn() };
let checkoutEnabled = false;
vi.mock("@app/contexts/CheckoutContext", () => ({
  useCheckoutOptional: () => (checkoutEnabled ? checkout : null),
}));
vi.mock("@app/portal/api/billing", () => ({
  fetchWallet: () => fetchWallet(),
  refreshWalletCache: () => refreshWalletCache(),
  fetchPaymentMethod: () => Promise.resolve(null),
  fetchBillingDetails: () => Promise.resolve(null),
  fetchInvoices: () => Promise.resolve([]),
}));
const fetchLocalUsage = vi.fn().mockResolvedValue(null);
vi.mock("@app/portal/api/link", () => ({
  fetchLocalUsage: () => fetchLocalUsage(),
  triggerLocalSync: () => Promise.resolve(),
}));
vi.mock("@app/portal/hooks/useStripePortal", () => ({
  useStripePortal: () => ({ opening: false, open: vi.fn(), error: null }),
}));
// Stub the plan views so the test doesn't depend on the full wallet shape.
vi.mock("@app/portal/components/billing/FreePlanView", () => ({
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
vi.mock("@app/portal/components/billing/SubscribedPlanView", () => ({
  SubscribedPlanView: () => null,
}));

import { Usage } from "@app/portal/views/Usage";
import {
  portalSaasSessionRestored,
  withPortalSaasSession,
  SaasSessionRequiredError,
  resetPortalSaasSessionState,
} from "@app/portal/auth/portalSaasSession";

vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => null,
}));
vi.mock("@app/portal/auth/saasSupabase", () => ({
  ensureSaasSupabase: vi.fn(),
}));
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
    legacyBilling.subscriptions = [];
    legacyBilling.loading = false;
    legacyBilling.loadError = false;
    legacyBilling.portalError = false;
    vi.mocked(legacyBilling.openPortal).mockClear();
    checkoutEnabled = false;
    checkout.openCheckout.mockReset();
    resetPortalSaasSessionState();
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
    fetchWallet.mockResolvedValue({
      ...walletOf("free"),
      teamId: 42,
      role: "leader",
    });
    fetchCheckoutPricing.mockResolvedValue({
      currency: "gbp",
      currencyLocked: false,
    });
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
        resolveCurrency: expect.any(Function),
      }),
    );
    await checkout.openCheckout.mock.calls[0][1].resolveCurrency("gbp");
    expect(fetchCheckoutPricing).toHaveBeenCalledWith(42, "currency", "gbp");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/settings/billing",
    );
    await waitFor(() =>
      expect(screen.getByTestId("location")).not.toHaveTextContent("upgrade="),
    );
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

    renderUsage(
      <Usage
        onWalletLoaded={onWalletLoaded}
        sessionRecovery={<span>Renew billing access</span>}
      />,
    );

    // Renders immediately (no link prompt / login) and loads unconditionally.
    expect(screen.getByText("Usage & Billing")).toBeInTheDocument();
    await waitFor(() =>
      expect(onWalletLoaded).toHaveBeenCalledWith(walletOf("free")),
    );
  });

  it.each(["pro", "team"] as const)(
    "shows the legacy %s owner's plan and billing even when their current team role is member",
    async (plan) => {
      legacyBilling.subscriptions = [
        {
          id: "sub_old",
          plan,
          status: "active",
          currentPeriodEnd: "2026-10-12T00:00:00Z",
          teamId: null,
          teamAllowance: null,
        },
      ];
      fetchWallet.mockResolvedValue(walletOf("free"));
      renderUsage(<Usage />);
      await screen.findByText(
        plan === "pro" ? "Pro (legacy)" : "Team (legacy)",
      );
      await screen.findByText(formatPeriodDate("2026-10-12", { year: true }));
      expect(
        screen.getByText("Next invoice").closest("section"),
      ).toHaveAttribute("id", "ub-pay");
      expect(
        screen.queryByText("Free", { exact: true }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "Manage subscription" }),
      );
      expect(
        screen.getAllByRole("button", { name: "Manage subscription" }),
      ).toHaveLength(1);
      expect(
        screen
          .getByRole("button", { name: "Manage subscription" })
          .closest(".billing-page__head"),
      ).not.toBeNull();
      expect(legacyBilling.openPortal).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps legacy billing available when the wallet cannot load", async () => {
    legacyBilling.subscriptions = [
      {
        id: "sub_old",
        plan: "pro",
        status: "past_due",
        currentPeriodEnd: null,
        teamId: null,
        teamAllowance: null,
      },
    ];
    fetchWallet.mockRejectedValue(new Error("Wallet unavailable"));
    renderUsage(<Usage />);
    await screen.findByText("Wallet unavailable");
    expect(screen.getByText("Payment overdue")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage subscription" }),
    ).toBeEnabled();
  });

  it.each(["loading", "loadError"] as const)(
    "does not label the owner Free when the legacy lookup is %s",
    async (state) => {
      legacyBilling[state] = true;
      fetchWallet.mockResolvedValue(walletOf("free"));
      const loaded = vi.fn();
      renderUsage(<Usage onWalletLoaded={loaded} />);
      await waitFor(() => expect(loaded).toHaveBeenCalled());
      expect(
        screen.queryByText("Free", { exact: true }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "Manage subscription",
        }),
      ).not.toBeInTheDocument();
    },
  );

  it("shows a current Processor holding alongside the legacy subscription", async () => {
    legacyBilling.subscriptions = [
      {
        id: "sub_old",
        plan: "team",
        status: "active",
        currentPeriodEnd: null,
        teamId: null,
        teamAllowance: null,
      },
    ];
    fetchWallet.mockResolvedValue({
      ...walletOf("subscribed"),
      processor: { active: true },
    });
    renderUsage(<Usage />);
    await screen.findByText("Processor", { selector: ".billing-id__name" });
    expect(
      screen.getByText("Team (legacy)", { selector: ".billing-id__name" }),
    ).toBeInTheDocument();
  });

  it.each([
    [1, 5, "1 of 5 users"],
    [1, 8, "1 of 8 users"],
    [12, 5, "1 of 12 users"],
    [null, 5, "1 · Unlimited"],
  ] as const)(
    "preserves the included allowance or greater legacy Pro capacity (%s seats, %s included)",
    async (maxUsers, freeUserAllowance, expectedFact) => {
      legacyBilling.subscriptions = [
        {
          id: "sub_pro",
          plan: "pro",
          status: "active",
          currentPeriodEnd: null,
          teamId: 42,
          teamAllowance: { teamId: 42, maxUsers, usersInUse: 1 },
        },
      ];
      fetchWallet.mockResolvedValue({
        ...walletOf("free"),
        teamId: 42,
        freeUserAllowance,
      });
      renderUsage(<Usage />);
      await screen.findByText(expectedFact);
      expect(screen.queryByText("1 of 1 users")).not.toBeInTheDocument();
      expect(screen.getByText("Pro (legacy)")).toBeInTheDocument();
    },
  );

  it.each([12, null])(
    "uses the legacy team's recorded capacity (%s) instead of the free or new Team offer",
    async (maxUsers) => {
      legacyBilling.subscriptions = [
        {
          id: "sub_old",
          plan: "team",
          status: "active",
          currentPeriodEnd: null,
          teamId: 42,
          teamAllowance: { teamId: 42, maxUsers, usersInUse: 3 },
        },
      ];
      fetchWallet.mockResolvedValue({
        ...walletOf("free"),
        teamId: 42,
        freeUserAllowance: 5,
      });
      renderUsage(<Usage />);
      await screen.findByText("Current allowance for your legacy team");
      expect(
        screen.queryByText("The Team plan covers 100 users"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("1 of 5 users")).not.toBeInTheDocument();
      expect(screen.queryByText("Add capacity")).not.toBeInTheDocument();
      expect(
        screen.getAllByText(
          maxUsers == null ? "3 · Unlimited" : "3 of 12 users",
        ).length,
      ).toBeGreaterThan(0);
    },
  );

  it("does not apply the legacy team's capacity to an unrelated wallet", async () => {
    legacyBilling.subscriptions = [
      {
        id: "sub_old",
        plan: "team",
        status: "active",
        currentPeriodEnd: null,
        teamId: 99,
        teamAllowance: { teamId: 99, maxUsers: null, usersInUse: 3 },
      },
    ];
    fetchWallet.mockResolvedValue({
      ...walletOf("free"),
      teamId: 42,
      freeUserAllowance: 5,
    });
    renderUsage(<Usage />);
    await screen.findByText("1 of 5 users");
    expect(
      screen.queryByText("Current allowance for your legacy team"),
    ).not.toBeInTheDocument();
  });

  it("flags missing legacy team capacity without inventing an entitlement", async () => {
    legacyBilling.subscriptions = [
      {
        id: "sub_old",
        plan: "team",
        status: "active",
        currentPeriodEnd: null,
        teamId: null,
        teamAllowance: null,
      },
    ];
    fetchWallet.mockResolvedValue(walletOf("free"));
    renderUsage(<Usage />);
    await screen.findByText(
      "We couldn't confirm your team's user allowance. Contact support to check your legacy plan.",
    );
    expect(
      screen.getByRole("button", { name: "Manage subscription" }),
    ).toBeEnabled();
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

  it("hides stale purchase controls when the billing session becomes unavailable", async () => {
    fetchWallet.mockResolvedValue({ ...walletOf("free"), role: "leader" });
    renderUsage(<Usage sessionRecovery={<span>Renew billing access</span>} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Switch on the Processor" }),
    );
    expect(screen.getByTestId("activation-step")).toBeInTheDocument();
    await act(async () => {
      await withPortalSaasSession(
        async () => 401,
        (status) => status === 401,
      ).catch(() => {});
    });
    expect(screen.queryByTestId("activation-step")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch on the Processor" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usage" })).toBeInTheDocument();
  });

  it("shows one recovery notice without a separate expired-session banner", async () => {
    fetchWallet.mockRejectedValue(new SaasSessionRequiredError());
    await act(async () => {
      renderUsage(
        <Usage sessionRecovery={<span>Renew billing access</span>} />,
      );
    });
    expect(screen.getAllByText("Renew billing access")).toHaveLength(1);
    expect(
      await screen.findByText(/Your plan and usage will appear/),
    ).toBeVisible();
    expect(screen.queryByText("Session expired")).not.toBeInTheDocument();
  });

  it("reloads billing after SDK recovery from another tab", async () => {
    await expect(
      withPortalSaasSession(
        async () => 401,
        (status) => status === 401,
      ),
    ).rejects.toBeInstanceOf(SaasSessionRequiredError);
    fetchWallet
      .mockRejectedValueOnce(new SaasSessionRequiredError())
      .mockResolvedValue(walletOf("free"));
    const onWalletLoaded = vi.fn();
    renderUsage(
      <Usage
        onWalletLoaded={onWalletLoaded}
        sessionRecovery={<span>Renew billing access</span>}
      />,
    );
    await screen.findByText(/Your plan and usage will appear/);
    act(() =>
      window.dispatchEvent(new Event("stirling-saas-session-restored")),
    );
    await waitFor(() =>
      expect(onWalletLoaded).toHaveBeenCalledWith(walletOf("free")),
    );
    expect(screen.queryByText(/Your plan and usage will appear/)).toBeNull();
    expect(screen.getByText("This cycle")).toBeVisible();
    expect(fetchWallet).toHaveBeenCalledTimes(2);
  });

  it("reloads billing and clears the expired-session view after renewal", async () => {
    fetchWallet
      .mockRejectedValueOnce(new SaasSessionRequiredError())
      .mockResolvedValue(walletOf("free"));
    const onWalletLoaded = vi.fn();
    renderUsage(
      <Usage
        onWalletLoaded={onWalletLoaded}
        sessionRecovery={<span>Renew billing access</span>}
      />,
    );
    await screen.findByText(/Your plan and usage will appear/);
    act(() => portalSaasSessionRestored());
    await waitFor(() =>
      expect(onWalletLoaded).toHaveBeenCalledWith(walletOf("free")),
    );
    expect(screen.queryByText(/Your plan and usage will appear/)).toBeNull();
    expect(screen.getByText("This cycle")).toBeVisible();
    expect(fetchWallet).toHaveBeenCalledTimes(2);
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

describe("Usage — refresh cost", () => {
  const wallet = {
    status: "free",
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
  };

  beforeEach(() => {
    fetchWallet.mockReset().mockResolvedValue(wallet);
    refreshWalletCache.mockReset().mockResolvedValue(undefined);
    fetchLocalUsage.mockReset().mockResolvedValue(null);
    bundleFlow.status = "none";
    procurement.loading = false;
    procurement.loadError = null;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    resetTabVisibility();
    vi.useRealTimers();
  });

  /** Settles the mount read before counting anything after it. */
  async function mounted() {
    await waitFor(() => expect(fetchWallet).toHaveBeenCalled());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    return fetchWallet.mock.calls.length;
  }

  it("does not re-read the wallet for every window focus", async () => {
    renderUsage(<Usage />);
    const base = await mounted();

    // Alt-tab, closing a dialog, clicking back from another app: all fire this.
    for (let i = 0; i < 5; i += 1) {
      fireEvent.focus(window);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    }

    expect(fetchWallet).toHaveBeenCalledTimes(base);
  });

  it("re-reads on a schedule while the page is open", async () => {
    renderUsage(<Usage />);
    const base = await mounted();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(fetchWallet.mock.calls.length).toBeGreaterThan(base);
  });

  it("catches up on a tab return, but not for a return inside the fresh window", async () => {
    renderUsage(<Usage />);
    const base = await mounted();

    // Straight back: the figures are seconds old, so the return costs nothing.
    setTabHidden(true);
    setTabHidden(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchWallet).toHaveBeenCalledTimes(base);

    // Back after long enough that they are stale, which is worth a read.
    setTabHidden(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    setTabHidden(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchWallet.mock.calls.length).toBeGreaterThan(base);
  });

  it("stops reading while the tab is hidden", async () => {
    renderUsage(<Usage />);
    const base = await mounted();

    setTabHidden(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });

    expect(fetchWallet).toHaveBeenCalledTimes(base);
  });

  it("keeps the figures on screen while it re-reads", async () => {
    const view = renderUsage(<Usage />);
    await mounted();
    const shown = view.container.textContent;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    // A revalidation must not blank the page back to its loading state.
    expect(view.container.textContent).toBe(shown);
  });
});
