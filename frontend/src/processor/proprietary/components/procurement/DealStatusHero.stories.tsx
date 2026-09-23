import type { Meta, StoryObj } from "@storybook/react-vite";
import { DealStatusHero } from "@portal/components/procurement/DealStatusHero";
import type { ProcurementSnapshot } from "@portal/api/procurement";
import { BillingScreen } from "@app/billing/BillingScreen";
import { freeWallet } from "@app/billing/walletFixtures";

const base: ProcurementSnapshot = {
  dealId: 1,
  stage: "trial",
  deployment: "cloud",
  seats: 250,
  trialStartedAt: "2026-06-25T00:00:00Z",
  trialEndsAt: "2026-07-09T00:00:00Z",
  trialExtensionsUsed: 0,
  licensed: false,
  licenseKey: null,
  businessName: null,
  contactName: null,
  contactEmail: null,
  agreementSignedVersion: null,
  latestQuote: null,
};

/** The CTA opens the existing flow; the billing stories exercise its section and jump link. */
const meta: Meta<typeof DealStatusHero> = {
  title: "Portal/Procurement/DealStatusHero",
  component: DealStatusHero,
  parameters: { layout: "padded" },
  args: {
    canSchedule: true,
    onExpand: () => {},
    onAcceptQuote: () => {},
    onLicense: () => {},
    onInvite: () => {},
    onSchedule: () => {},
    onManageTrial: () => {},
    onDocuments: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof DealStatusHero>;

export const Trial: Story = {
  args: {
    snapshot: {
      ...base,
      trialEndsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  },
};
export const Quote: Story = {
  args: { snapshot: { ...base, stage: "quote", trialEndsAt: null } },
};
export const Agreement: Story = {
  args: { snapshot: { ...base, stage: "security", trialEndsAt: null } },
};
export const Payment: Story = {
  args: { snapshot: { ...base, stage: "procurement", trialEndsAt: null } },
};
export const Live: Story = {
  args: {
    snapshot: { ...base, stage: "active", licensed: true, trialEndsAt: null },
  },
};

export const BillingTrial: Story = {
  parameters: { layout: "fullscreen" },
  args: Trial.args,
  render: (args) => (
    <BillingScreen
      wallet={freeWallet}
      procurementSection={<DealStatusHero {...args} />}
    />
  ),
};

export const BillingExpiredTrial: Story = {
  ...BillingTrial,
  args: {
    snapshot: { ...base, stage: "quote", trialEndsAt: "2020-01-01T00:00:00Z" },
  },
};

export const BillingTrialDark: Story = {
  ...BillingTrial,
  globals: { theme: "dark" },
};
