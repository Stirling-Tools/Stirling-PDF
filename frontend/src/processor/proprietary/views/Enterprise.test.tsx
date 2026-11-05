import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProcurementSnapshot } from "@processor/api/procurement";
import type { ProcurementController } from "@processor/components/procurement/useProcurement";
import type { TrialDraft } from "@processor/components/procurement/trialDraft";
import { Enterprise } from "@processor/views/Enterprise";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, value?: unknown) =>
      typeof value === "string" ? value : key,
    i18n: { language: "en-US" },
  }),
}));

const state = vi.hoisted(() => ({
  controller: null as unknown as ProcurementController,
  gate: {
    loading: false,
    gated: false,
    available: true,
    error: null as string | null,
    retry: () => {},
    connect: () => {},
  },
  owner: true,
  linkProvider: true as boolean,
  role: "leader",
  signedIn: true,
  draft: null as TrialDraft | null,
  flowStep: null as "builder" | "agreement" | null,
  useProcurement: null as unknown as () => ProcurementController,
}));

vi.mock("@editor/auth", () => ({
  useAuth: () => ({
    loading: false,
    isAnonymous: false,
    session: state.signedIn ? {} : null,
    user: state.signedIn ? { email: "Dana@Northwind.example" } : null,
  }),
}));
const rememberPendingDestination = vi.hoisted(() => vi.fn());
vi.mock("@editor/services/pendingDestination", () => ({
  rememberPendingDestination,
}));
const saveTrialDraft = vi.hoisted(() => vi.fn());
vi.mock("@processor/components/procurement/trialDraft", () => ({
  saveTrialDraft,
  takeTrialDraft: () => state.draft,
}));

vi.mock("@processor/components/procurement/useProcurement", () => ({
  useProcurement: () => state.useProcurement(),
}));
vi.mock("@processor/hooks/useConnectGate", () => ({
  useConnectGate: () => state.gate,
}));
vi.mock("@processor/hooks/useAccountLinkOwner", () => ({
  useAccountLinkOwner: () => state.owner,
}));
vi.mock("@processor/hooks/useLinkedAccountEmail", () => ({
  useLinkedAccountEmail: () => null,
}));
vi.mock("@processor/contexts/LinkContext", () => ({
  useLinkOptional: () => (state.linkProvider ? {} : null),
}));
vi.mock("@processor/contexts/UIContext", () => ({
  useUI: () => ({ openSettings: vi.fn() }),
}));
vi.mock("@processor/components/account-link/SaasSessionBanner", () => ({
  SaasSessionBanner: () => null,
}));
vi.mock("@processor/components/procurement/ProcurementFlow", () => ({
  ProcurementFlow: () => null,
  procurementFlowStep: () => state.flowStep,
}));
vi.mock("@processor/api/billing", () => ({
  refreshWalletCache: () => Promise.resolve(),
}));
vi.mock("@processor/queries/wallet", () => ({
  walletQuery: (linked: boolean) => ({
    queryKey: ["wallet", linked],
    queryFn: async () => {
      if (state.role === "unavailable") throw new Error("Wallet unavailable");
      return { role: state.role };
    },
    enabled: linked,
  }),
}));

const trial: ProcurementSnapshot = {
  dealId: 1,
  stage: "trial",
  deployment: "selfhost",
  seats: 50,
  trialStartedAt: "2026-09-01T00:00:00Z",
  trialEndsAt: "2099-09-15T00:00:00Z",
  trialExtensionsUsed: 0,
  licensed: true,
  licenseKey: "TRIAL-KEY",
  agreementSignedVersion: null,
  businessName: "Northwind",
  contactName: null,
  contactEmail: null,
  latestQuote: null,
};

function controller(
  overrides: Partial<ProcurementController> = {},
): ProcurementController {
  const data = overrides.data === undefined ? trial : overrides.data;
  return {
    isLinked: true,
    loading: false,
    loadError: null,
    retry: vi.fn(),
    data,
    started: data?.dealId != null,
    stage: data?.stage ?? undefined,
    latest: data?.latestQuote ?? null,
    isIssued: false,
    isDraft: true,
    busy: false,
    downloading: false,
    downloadingLicense: false,
    downloadingAgreement: false,
    error: null,
    setError: vi.fn(),
    open: false,
    setOpen: vi.fn(),
    editing: false,
    setEditing: vi.fn(),
    extra: null,
    setExtra: vi.fn(),
    invoicePdf: null,
    onExploreEnterprise: vi.fn(),
    onConfirmSetup: vi.fn(),
    onExtendTrial: vi.fn(),
    onReset: vi.fn(),
    onGenerate: vi.fn(),
    onAcceptQuote: vi.fn(),
    onAgree: vi.fn(),
    onDownloadPdf: vi.fn(),
    onDownloadOfflineLicense: vi.fn(),
    onDownloadSignedAgreement: vi.fn(),
    ...overrides,
  };
}

function mount() {
  render(
    <MantineProvider>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <Enterprise />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

beforeEach(() => {
  state.gate = { ...state.gate, available: true, connect: vi.fn() };
  state.owner = true;
  state.linkProvider = true;
  state.role = "leader";
  state.signedIn = true;
  state.draft = null;
  state.flowStep = null;
  state.useProcurement = vi.fn(() => state.controller);
  rememberPendingDestination.mockReset();
  saveTrialDraft.mockReset();
});

describe("Enterprise page", () => {
  it("asks a server's owner to connect before anything else", () => {
    state.controller = controller({ isLinked: false, data: null });
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "portal.procurement.link.cta" }),
    );
    expect(state.gate.connect).toHaveBeenCalledOnce();
    expect(state.controller.onExploreEnterprise).not.toHaveBeenCalled();
  });

  it("tells another administrator that only the owner can connect", () => {
    state.owner = false;
    state.controller = controller({ isLinked: false, data: null });
    mount();
    expect(
      screen.queryByRole("button", { name: "portal.procurement.link.cta" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Only this server’s owner can connect it. Ask them to open this page.",
      ),
    ).toBeInTheDocument();
  });

  it("records interest once and offers the trial setup to a leader with no deal", async () => {
    state.controller = controller({ data: null });
    mount();
    expect(
      await screen.findByText("portal.procurement.setup.title"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(state.controller.onExploreEnterprise).toHaveBeenCalledOnce(),
    );
  });

  it("puts a trial's next step, licence and trial controls on the page", async () => {
    state.controller = controller();
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "portal.procurement.hero.ctaTrial",
      }),
    );
    expect(state.controller.setOpen).toHaveBeenCalledWith(true);
    expect(screen.getByText("TRIAL-KEY")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "portal.procurement.trial.extend" }),
    );
    expect(state.controller.onExtendTrial).toHaveBeenCalledOnce();
    expect(state.controller.onExploreEnterprise).not.toHaveBeenCalled();
  });

  it("opens the quote builder from the tracker's quote stage during the trial", async () => {
    state.controller = controller();
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /journeySteps.quote.label/,
      }),
    );
    expect(state.controller.setOpen).toHaveBeenCalledWith(true);
  });

  it("opens a finished stage read-only from the tracker, leaving the deal where it is", async () => {
    const signed: ProcurementSnapshot = {
      ...trial,
      stage: "procurement",
      agreementSignedVersion: "SEA v1",
      latestQuote: {
        quoteId: 7,
        quoteNumber: "QT-1",
        status: "accepted",
        currency: "usd",
        annualNetMinor: 1_600_000,
        tcvMinor: 1_600_000,
        renewalAnnualNetMinor: 1_650_000,
        cpiRatePct: 3,
        lineItems: [],
        validUntil: null,
        stripeQuoteId: "qt_1",
        invoiceUrl: "https://invoice.example/1",
        invoicePdf: null,
        config: {
          volume: 300_000,
          users: 50,
          intensity: 4,
          sizeMult: 1.4,
          deployment: "selfhost",
          termYears: 1,
          serviceLevel: "standard",
          indemnification: false,
          training: false,
          qbr: false,
          businessName: "Northwind",
        },
      },
    };
    state.controller = controller({ data: signed });
    mount();

    // Back from payment opens the agreement as it was signed.
    fireEvent.click(
      await screen.findByRole("button", { name: "Back to {{stage}}" }),
    );
    expect(screen.getByText("Version")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /journeySteps.trial.label/ }),
    );
    expect(screen.getByText("Your trial")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "portal.procurement.payment.viewInvoice",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /journeySteps.agreement.label/ }),
    );
    expect(screen.getByText("Version")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "portal.enterprise.review.back" }),
    );
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "portal.procurement.payment.viewInvoice",
      }),
    ).toBeInTheDocument();
    expect(state.controller.setOpen).not.toHaveBeenCalled();

    // Leaving mid-review and coming back (from settings, say) lands on the stage the deal has
    // reached, not the finished one last looked at.
    fireEvent.click(
      screen.getByRole("button", { name: /journeySteps.trial.label/ }),
    );
    cleanup();
    mount();
    expect(
      await screen.findByRole("button", {
        name: "portal.procurement.payment.viewInvoice",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("lets a member follow the deal without acting on it", async () => {
    state.role = "member";
    state.controller = controller();
    mount();
    expect(
      await screen.findByText(
        "Your team leader runs this deal. You can follow its progress here.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "portal.procurement.hero.ctaTrial",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "portal.procurement.trial.extend" }),
    ).not.toBeInTheDocument();
  });

  it("leaves the quote builder for the trial it was opened from", async () => {
    state.flowStep = "builder";
    state.controller = controller({ open: true });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Back to {{stage}}" }),
    );
    expect(state.controller.setOpen).toHaveBeenCalledWith(false);
  });

  it("has nothing to go back to from the first stage", async () => {
    state.controller = controller();
    mount();
    await screen.findAllByText("portal.procurement.journeySteps.trial.label");
    expect(
      screen.queryByRole("button", { name: "Back to {{stage}}" }),
    ).not.toBeInTheDocument();
  });

  it("links the logo back into the app", () => {
    state.controller = controller();
    mount();
    expect(
      screen.getByRole("link", { name: "Go to Stirling" }),
    ).toHaveAttribute("href", "/");
  });

  it("says the wallet failed rather than showing a leader the member view", async () => {
    state.role = "unavailable";
    state.controller = controller();
    mount();
    expect(await screen.findByText("Wallet unavailable")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Your team leader runs this deal. You can follow its progress here.",
      ),
    ).not.toBeInTheDocument();
  });

  it("offers no fresh start while the deal cannot be loaded", async () => {
    state.controller = controller({
      data: null,
      loadError: "Snapshot unavailable",
    });
    mount();
    expect(await screen.findByText("Snapshot unavailable")).toBeInTheDocument();
    expect(
      screen.queryByText("portal.procurement.setup.title"),
    ).not.toBeInTheDocument();
    expect(state.controller.onExploreEnterprise).not.toHaveBeenCalled();
  });

  it("lets a visitor without an account fill in the trial, and asks them to sign in to start it", () => {
    state.signedIn = false;
    mount();
    expect(state.useProcurement).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByLabelText(/^portal\.procurement\.setup\.seats/),
      {
        target: { value: "40" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "portal.procurement.setup.continue" }),
    );
    fireEvent.change(
      screen.getByLabelText(/^portal.procurement.setup.fullName/),
      { target: { value: "Dana Lee" } },
    );
    fireEvent.change(
      screen.getByLabelText(/^portal.procurement.setup.businessName/),
      { target: { value: "Northwind" } },
    );
    fireEvent.change(
      screen.getByLabelText(/^portal.procurement.setup.workEmail/),
      { target: { value: "dana@northwind.example" } },
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Sign in to start your trial" }),
    );

    expect(saveTrialDraft).toHaveBeenCalledWith({
      deployment: "cloud",
      seats: 40,
      details: {
        businessName: "Northwind",
        contactName: "Dana Lee",
        contactEmail: "dana@northwind.example",
        inviteEmails: "",
      },
      eulaAgreed: true,
    });
    expect(rememberPendingDestination).toHaveBeenCalledOnce();
  });

  it("returns a visitor from sign-in to their own answers", async () => {
    state.draft = {
      deployment: "selfhost",
      seats: 40,
      details: {
        businessName: "Northwind",
        contactName: "Dana Lee",
        contactEmail: "dana@northwind.example",
      },
    };
    state.controller = controller({ data: null });
    mount();
    expect(
      await screen.findByLabelText(/^portal.procurement.setup.businessName/),
    ).toHaveValue("Northwind");
    expect(
      screen.getByRole("button", { name: "portal.procurement.setup.start" }),
    ).toBeInTheDocument();
  });

  it("starts the trial on return from sign-in when the terms were agreed before it", async () => {
    const details = {
      businessName: "Northwind",
      contactName: "Dana Lee",
      contactEmail: "dana@northwind.example",
    };
    state.draft = {
      deployment: "selfhost",
      seats: 40,
      details,
      eulaAgreed: true,
    };
    state.controller = controller({ data: null });
    mount();
    await waitFor(() =>
      expect(state.controller.onConfirmSetup).toHaveBeenCalledWith(
        "selfhost",
        40,
        details,
      ),
    );
    expect(state.controller.onConfirmSetup).toHaveBeenCalledOnce();
    expect(state.controller.onExploreEnterprise).not.toHaveBeenCalled();
    // The form it is leaving is never shown while the trial starts.
    expect(
      screen.queryByText("portal.procurement.setup.title"),
    ).not.toBeInTheDocument();
  });

  it("leaves answers given for another account behind", async () => {
    state.draft = {
      deployment: "selfhost",
      seats: 40,
      details: {
        businessName: "Contoso",
        contactName: "Sam Roe",
        contactEmail: "sam@contoso.example",
      },
      eulaAgreed: true,
    };
    state.controller = controller({ data: null });
    mount();
    // A fresh setup, as if no answers were kept.
    expect(
      await screen.findByText("portal.procurement.setup.title"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(state.controller.onExploreEnterprise).toHaveBeenCalledOnce(),
    );
    expect(state.controller.onConfirmSetup).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Contoso")).not.toBeInTheDocument();
  });

  it("brings the trial setup back if starting it on return fails", async () => {
    state.draft = {
      deployment: "cloud",
      seats: 1,
      details: { businessName: "Northwind", contactName: "Dana Lee" },
      eulaAgreed: true,
    };
    state.controller = controller({ data: null, error: "Trial failed" });
    mount();
    expect(
      await screen.findByText("portal.procurement.setup.title"),
    ).toBeInTheDocument();
  });
});
