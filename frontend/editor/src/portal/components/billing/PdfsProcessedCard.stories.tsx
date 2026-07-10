import type { Meta, StoryObj } from "@storybook/react-vite";
import { PdfsProcessedCard } from "@portal/components/billing/PdfsProcessedCard";
import { subscribedWallet } from "@portal/components/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof PdfsProcessedCard> = {
  title: "Portal/Billing/PdfsProcessedCard",
  component: PdfsProcessedCard,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PdfsProcessedCard>;

/** Metered PDFs split across API / Agents / Automation (real categoryBreakdown). */
export const WithBreakdown: Story = { args: { wallet: subscribedWallet } };

/** Synced usage plus instance-local work not yet billed — headline + split combine, with a pending note. */
export const WithUnsynced: Story = {
  args: {
    wallet: subscribedWallet,
    unsynced: {
      periodStart: subscribedWallet.billingPeriodStart,
      apiUnsyncedUnits: 12,
      aiUnsyncedUnits: 3,
      automationUnsyncedUnits: 0,
      totalUnsyncedUnits: 15,
    },
  },
};

/** Nothing processed yet this period — the split + summary hide. */
export const Empty: Story = {
  args: {
    wallet: {
      ...subscribedWallet,
      billableUsed: 0,
      spendUnitsThisPeriod: 0,
      categoryBreakdown: { api: 0, ai: 0, automation: 0 },
      categoryDocs: { api: 0, ai: 0, automation: 0 },
      docsProcessedThisPeriod: 0,
      uniquePdfsThisPeriod: 0,
      sizeMultiplierPdfsThisPeriod: 0,
    },
  },
};
