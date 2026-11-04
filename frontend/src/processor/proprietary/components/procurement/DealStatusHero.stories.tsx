import type { Meta, StoryObj } from "@storybook/react-vite";
import { DealStatusHero } from "@processor/components/procurement/DealStatusHero";
import type { ProcurementSnapshot } from "@processor/api/procurement";
import { BillingScreen } from "@editor/billing/BillingScreen";
import { freeWallet } from "@editor/billing/walletFixtures";

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

/** Billing's view of a deal underway; its one action opens the Enterprise page. */
const meta: Meta<typeof DealStatusHero> = {
  title: "Portal/Procurement/DealStatusHero",
  component: DealStatusHero,
  parameters: { layout: "padded" },
  args: { onOpen: () => {} },
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

/** Members follow the deal from billing without a way into it. */
export const Member: Story = {
  args: { ...Trial.args, onOpen: undefined },
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
