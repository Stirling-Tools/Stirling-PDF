import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpendLimitCard } from "@portal/components/billing/SpendLimitCard";
import { subscribedWallet } from "@portal/components/billing/walletFixtures";
import type { Wallet } from "@portal/api/billing";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof SpendLimitCard> = {
  title: "Portal/Billing/SpendLimitCard",
  component: SpendLimitCard,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof SpendLimitCard>;

/** Interactive wrapper so the in-place "Adjust limit" edit toggle works in-story. */
function Demo({ wallet, open = false }: { wallet: Wallet; open?: boolean }) {
  const [adjusting, setAdjusting] = useState(open);
  return (
    <SpendLimitCard
      wallet={wallet}
      adjusting={adjusting}
      onAdjustingChange={setAdjusting}
    />
  );
}

/** Comfortably within the cap. */
export const WithinCap: Story = {
  render: () => <Demo wallet={subscribedWallet} />,
};

/** Approaching the cap — % used chip + run-rate projection. */
export const ApproachingCap: Story = {
  render: () => (
    <Demo
      wallet={{
        ...subscribedWallet,
        estimatedBillMinor: 85_000,
        billableUsed: 42_500,
        spendUnitsThisPeriod: 42_500,
      }}
    />
  ),
};

/** The in-place editor — buckets + suggested shortcut + guardrail + Save. */
export const Editing: Story = {
  render: () => (
    <Demo
      wallet={{
        ...subscribedWallet,
        estimatedBillMinor: 85_000,
        billableUsed: 42_500,
        spendUnitsThisPeriod: 42_500,
      }}
      open
    />
  ),
};

/** Uncapped — no bar, no projection. */
export const NoCap: Story = {
  render: () => (
    <Demo wallet={{ ...subscribedWallet, noCap: true, capUsd: null }} />
  ),
};
