import type { Meta, StoryObj } from "@storybook/react-vite";
import { BillingKpiStrip } from "@portal/components/usage/BillingKpiStrip";
import { buildBillingSummary } from "@portal/mocks/usage";

const meta: Meta<typeof BillingKpiStrip> = {
  title: "Portal/Usage/BillingKpiStrip",
  component: BillingKpiStrip,
};
export default meta;
type Story = StoryObj<typeof BillingKpiStrip>;

// The "remaining in plan" KPI replaces overage on free.
export const Free: Story = {
  args: { summary: buildBillingSummary("free") },
  globals: { tier: "free" },
};

// Pro surfaces metered overage cost + docs past cap.
export const Pro: Story = {
  args: { summary: buildBillingSummary("pro") },
  globals: { tier: "pro" },
};

// Enterprise swaps overage for commit utilisation.
export const Enterprise: Story = {
  args: { summary: buildBillingSummary("enterprise") },
  globals: { tier: "enterprise" },
};

// Summary still loading — every metric falls back to an em dash.
export const Loading: Story = {
  args: { summary: null },
  globals: { tier: "pro" },
};
