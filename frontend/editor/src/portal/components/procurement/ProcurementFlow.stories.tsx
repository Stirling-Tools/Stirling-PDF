import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProcurementFlow } from "@portal/components/procurement/ProcurementFlow";
import type { ProcurementController } from "@portal/components/procurement/useProcurement";
import type { ProcurementSnapshot, QuoteResult } from "@portal/api/procurement";
import "@portal/views/Procurement.css";

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
  latestQuote: quote,
};

/** Builds a fully-populated controller so callers only need to override the fields a story cares about. */
function makeController(
  overrides: Partial<ProcurementController> = {},
): ProcurementController {
  return {
    isLinked: true,
    loading: false,
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
    onStartTrial: () => {},
    onConfirmSetup: () => {},
    onExtendTrial: () => {},
    onReset: () => {},
    onGenerate: () => {},
    onAgree: () => {},
    onDownloadPdf: async () => {},
    onDownloadOfflineLicense: async () => {},
    ...overrides,
  };
}

/**
 * The procurement takeover flow: quote & agreement, payment, and live stages, driven by a
 * plain ProcurementController object (no live backend needed to render each stage).
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

// No linked account yet: the modal shows the "link your account" empty state.
export const Unlinked: Story = {
  args: {
    controller: makeController({
      isLinked: false,
      data: null,
      started: false,
      stage: undefined,
      latest: null,
      isIssued: false,
      isDraft: true,
    }),
  },
};

// Snapshot still loading: the skeleton placeholder shows instead of a stage.
export const Loading: Story = {
  args: {
    controller: makeController({
      loading: true,
      data: null,
      started: false,
      stage: undefined,
      latest: null,
    }),
  },
};
