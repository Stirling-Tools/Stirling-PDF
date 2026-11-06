import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import type { Decorator } from "@storybook/react-vite";
import { AuthContext, useAuth } from "@editor/auth/context";
import { WithOrgOwner } from "@processor/test/WithOrgOwner";
import { Enterprise } from "@processor/views/Enterprise";
import type {
  ProcurementSnapshot,
  QuoteResult,
} from "@processor/api/procurement";
import { freeWallet } from "@processor/components/billing/walletFixtures";
import { RATE_CARD } from "@processor/mocks/handlers/procurementSaas";

const SAAS = "http://saas.mock";
const DAY = 86_400_000;

const quote: QuoteResult = {
  quoteId: 488,
  quoteNumber: "Q-2026-0488",
  status: "sent",
  currency: "USD",
  annualNetMinor: 8_400_000,
  tcvMinor: 25_200_000,
  renewalAnnualNetMinor: 8_652_000,
  cpiRatePct: 3,
  lineItems: [],
  validUntil: "2026-11-15",
  stripeQuoteId: "qt_1NWnd488",
  invoiceUrl: null,
  invoicePdf: null,
  config: {
    volume: 500_000,
    users: 250,
    intensity: 4,
    sizeMult: 1.4,
    deployment: "selfhost",
    termYears: 3,
    serviceLevel: "priority",
    indemnification: false,
    training: true,
    qbr: false,
    businessName: "Northwind Logistics",
  },
};

const trial: ProcurementSnapshot = {
  dealId: 1,
  stage: "trial",
  deployment: "selfhost",
  seats: 250,
  trialStartedAt: new Date(Date.now() - 4 * DAY).toISOString(),
  trialEndsAt: new Date(Date.now() + 10 * DAY).toISOString(),
  trialExtensionsUsed: 0,
  licensed: true,
  licenseKey: "STRL-ENT-7K2Q-9XWD-4MPA-TRIAL",
  agreementSignedVersion: null,
  businessName: "Northwind Logistics",
  contactName: "Dana Lee",
  contactEmail: "dana@northwind.example",
  latestQuote: null,
  rateCard: RATE_CARD,
  maxTrialExtensions: 2,
  entitledDeployment: "selfhost",
  minAnnualNetMinor: 1_200_000,
};

function handlers(snapshot: ProcurementSnapshot | null, role = "leader") {
  return [
    http.get(`${SAAS}/api/v1/procurement`, () =>
      HttpResponse.json(snapshot ?? { ...trial, dealId: null, stage: null }),
    ),
    http.post(`${SAAS}/api/v1/procurement/interest`, () =>
      HttpResponse.json({ ...trial, stage: "exploring", licenseKey: null }),
    ),
    http.post(`${SAAS}/api/v1/payg/wallet/refresh`, () =>
      HttpResponse.json({}),
    ),
    http.get(`${SAAS}/api/v1/payg/wallet`, () =>
      HttpResponse.json({ ...freeWallet, role }),
    ),
    http.get("/api/v1/config/app-config", () =>
      HttpResponse.json({ accountLinkAvailable: true }),
    ),
  ];
}

/** Stories default to a signed-in owner; `signedOut` previews a visitor from the website. */
const WithSession: Decorator = (Story, context) => {
  const auth = useAuth();
  return (
    <AuthContext.Provider
      value={{
        ...auth,
        loading: false,
        session: context.parameters.signedOut
          ? null
          : (auth.session ?? ({} as unknown as typeof auth.session)),
      }}
    >
      <Story />
    </AuthContext.Provider>
  );
};

/** The whole Enterprise journey on one page, outside the app's chrome. */
const meta: Meta<typeof Enterprise> = {
  title: "Portal/Procurement/Enterprise",
  component: Enterprise,
  parameters: { layout: "fullscreen" },
  decorators: [WithSession, WithOrgOwner],
};
export default meta;
type Story = StoryObj<typeof Enterprise>;

/** First visit: why Enterprise, beside the trial setup. */
export const Landing: Story = {
  parameters: { msw: { handlers: handlers(null) } },
};

/** A visitor from the website: the page and the trial setup, with sign-in only to start it. */
export const SignedOut: Story = {
  parameters: { signedOut: true, msw: { handlers: handlers(null) } },
};

/** A self-hosted server with no Stirling account yet: connecting comes first. */
export const NotConnected: Story = {
  globals: { linkState: "unlinked" },
  parameters: { msw: { handlers: handlers(null) } },
};

export const Trial: Story = {
  parameters: { msw: { handlers: handlers(trial) } },
};

/** At the quote stage with nothing issued yet: building it is the next step. */
export const QuoteDraft: Story = {
  parameters: {
    msw: { handlers: handlers({ ...trial, stage: "quote" }) },
  },
};

/** An issued quote is a decision: accept it, or open it again to read and circulate. */
export const QuoteIssued: Story = {
  parameters: {
    msw: {
      handlers: handlers({ ...trial, stage: "quote", latestQuote: quote }),
    },
  },
};

/** Quote accepted: the agreement is next, read and signed on the page. */
export const Agreement: Story = {
  parameters: {
    msw: {
      handlers: [
        ...handlers({ ...trial, stage: "security", latestQuote: quote }),
        http.get(`${SAAS}/api/v1/procurement/agreement/document`, () =>
          HttpResponse.json({
            docId: "enterprise-agreement",
            version: "0.9.1",
            versionLabel: "SEA v0.9.1",
            displayName: "Stirling Enterprise Agreement",
            effectiveDate: "2026-07-10",
            status: "draft",
            markdown: Array.from(
              { length: 12 },
              (_, i) =>
                `## ${i + 1}. Section\n\nThe parties agree to the terms set out in this section.`,
            ).join("\n\n"),
          }),
        ),
      ],
    },
  },
};

export const Payment: Story = {
  parameters: {
    msw: {
      handlers: handlers({
        ...trial,
        stage: "procurement",
        agreementSignedVersion: "SEA v0.9.1",
        latestQuote: {
          ...quote,
          status: "accepted",
          invoiceUrl: "https://invoice.stripe.com/i/mock",
        },
      }),
    },
  },
};

export const Live: Story = {
  parameters: {
    msw: {
      handlers: handlers({
        ...trial,
        stage: "active",
        licenseKey: "STRL-ENT-7K2Q-9XWD-4MPA-LIVE",
        agreementSignedVersion: "SEA v0.9.1",
        latestQuote: { ...quote, status: "accepted" },
      }),
    },
  },
};

/** Members follow the deal without its actions. */
export const Member: Story = {
  parameters: { msw: { handlers: handlers(trial, "member") } },
};
