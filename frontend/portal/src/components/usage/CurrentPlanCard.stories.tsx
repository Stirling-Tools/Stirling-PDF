import type { Meta, StoryObj } from "@storybook/react-vite";
import { CurrentPlanCard } from "@portal/components/usage/CurrentPlanCard";
import { buildBillingSummary } from "@portal/mocks/usage";

const meta: Meta<typeof CurrentPlanCard> = {
  title: "Portal/Usage/CurrentPlanCard",
  component: CurrentPlanCard,
  args: { onUpgrade: () => {} },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "32rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof CurrentPlanCard>;

// Free, approaching the cap — warning banner + cap meter.
export const FreeApproachingCap: Story = {
  args: { summary: buildBillingSummary("free") },
  globals: { tier: "free" },
};

// Free, cap reached — danger banner, processing paused.
export const FreeCapReached: Story = {
  args: {
    summary: {
      ...buildBillingSummary("free"),
      docsThisPeriod: 500,
      capReached: true,
    },
  },
  globals: { tier: "free" },
};

// Pro pay-as-you-go breakdown with metered overage.
export const Pro: Story = {
  args: { summary: buildBillingSummary("pro") },
  globals: { tier: "pro" },
};

// Enterprise committed-volume breakdown.
export const Enterprise: Story = {
  args: { summary: buildBillingSummary("enterprise") },
  globals: { tier: "enterprise" },
};
