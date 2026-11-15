import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProcurementFlow } from "@processor/components/procurement/ProcurementFlow";
import type { ProcurementController } from "@processor/components/procurement/useProcurement";
import type {
  ProcurementSnapshot,
  QuoteResult,
} from "@processor/api/procurement";
import "@processor/views/Procurement.css";
import { RATE_CARD } from "@processor/mocks/handlers/procurementSaas";

const quote: QuoteResult = {
  quoteId: 488,
  quoteNumber: "Q-2026-0488",
  status: "sent",
  currency: "USD",
  annualNetMinor: 8_400_000,
  tcvMinor: 25_200_000,
  renewalAnnualNetMinor: 8_652_000,
  cpiRatePct: 3,
  lineItems: [
    {
      key: "platform",
      label: "Platform subscription",
      kind: "RECURRING",
      amountMinor: 6_000_000,
    },
    {
      key: "support",
      label: "Premium support",
      kind: "RECURRING",
      amountMinor: 1_800_000,
    },
  ],
  validUntil: "2026-08-15",
  stripeQuoteId: "qt_1NWnd488",
  invoiceUrl: null,
  invoicePdf: null,
  config: {
    volume: 500,
    users: 25,
    intensity: 4,
    sizeMult: 1.4,
    deployment: "cloud",
    termYears: 3,
    serviceLevel: "standard",
    indemnification: true,
    training: false,
    qbr: true,
    businessName: "Northwind Logistics",
  },
};

const snapshot: ProcurementSnapshot = {
  dealId: 42,
  stage: "quote",
  deployment: "cloud",
  seats: 25,
  trialStartedAt: "2026-05-01T00:00:00Z",
  trialEndsAt: "2026-06-01T00:00:00Z",
  trialExtensionsUsed: 0,
  licensed: false,
  licenseKey: null,
  agreementSignedVersion: null,
  businessName: null,
  contactName: null,
  contactEmail: null,
  latestQuote: quote,
  rateCard: RATE_CARD,
  maxTrialExtensions: 2,
  minAnnualNetMinor: 0,
  entitledDeployment: null,
};

/** Builds a fully-populated controller so callers only need to override the fields a story cares about. */
function makeController(
  overrides: Partial<ProcurementController> = {},
): ProcurementController {
  return {
    isLinked: true,
    loading: false,
    loadError: null,
    retry: () => {},
    data: snapshot,
    started: true,
    stage: snapshot.stage ?? undefined,
    latest: quote,
    isIssued: true,
    isDraft: false,
    busy: false,
    downloading: false,
    downloadingLicense: false,
    error: null,
    setError: () => {},
    open: true,
    setOpen: () => {},
    editing: false,
    setEditing: () => {},
    extra: null,
    setExtra: () => {},
    invoicePdf: null,
    onConfirmSetup: () => {},
    onExtendTrial: () => {},
    onGenerate: async () => {},
    onAgree: () => {},
    onDownloadPdf: async () => {},
    onDownloadOfflineLicense: async () => {},
    downloadingAgreement: false,
    onAcceptQuote: async () => {},
    onDownloadSignedAgreement: async () => {},
    onExploreEnterprise: () => {},
    ...overrides,
  };
}

/**
 * The Enterprise page's takeover: the quote builder and the agreement, driven by a plain
 * ProcurementController object (no live backend needed to render each step).
 */
const meta: Meta<typeof ProcurementFlow> = {
  title: "Portal/Procurement/ProcurementFlow",
  component: ProcurementFlow,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof ProcurementFlow>;

// Quote issued and ready to agree to: the combined quote + agreement step.
export const Default: Story = {
  args: { controller: makeController() },
};

// Quote accepted: the agreement to read and sign.
export const Agreement: Story = {
  args: {
    controller: makeController({
      data: { ...snapshot, stage: "security" },
      stage: "security",
    }),
  },
};
