import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProcurementBanner } from "@portal/components/procurement/ProcurementBanner";
import type { ProcurementController } from "@portal/components/procurement/useProcurement";
import type { ProcurementSnapshot } from "@portal/api/procurement";

const snapshot: ProcurementSnapshot = {
  dealId: 1,
  stage: "trial",
  deployment: "cloud",
  seats: 250,
  trialStartedAt: "2026-06-25T00:00:00Z",
  trialEndsAt: "2026-07-09T00:00:00Z",
  trialExtensionsUsed: 0,
  licensed: false,
  licenseKey: null,
  latestQuote: null,
};

function makeController(
  overrides: Partial<ProcurementController> = {},
): ProcurementController {
  return {
    isLinked: true,
    loading: false,
    data: null,
    started: false,
    stage: undefined,
    latest: null,
    isIssued: false,
    isDraft: true,
    busy: false,
    downloading: false,
    downloadingLicense: false,
    error: null,
    setError: () => {},
    open: false,
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

/** Deal-status hero once a deal is underway, otherwise the enterprise on-ramp. */
const meta: Meta<typeof ProcurementBanner> = {
  title: "Portal/Procurement/ProcurementBanner",
  component: ProcurementBanner,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof meta>;

/** No deal yet: the enterprise on-ramp upsell. */
export const Upsell: Story = {
  args: { controller: makeController() },
};

/** A deal is underway: the wired deal-status hero. */
export const DealUnderway: Story = {
  args: {
    controller: makeController({
      started: true,
      data: snapshot,
      stage: snapshot.stage,
    }),
  },
};
