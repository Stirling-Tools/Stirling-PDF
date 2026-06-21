import type { Meta, StoryObj } from "@storybook/react-vite";
import { UpgradeModal } from "@portal/components/usage/UpgradeModal";
import { PLAN_OPTIONS } from "@portal/mocks/usage";

const enterprisePlan =
  PLAN_OPTIONS.find((p) => p.tier === "enterprise") ?? null;

const meta: Meta<typeof UpgradeModal> = {
  title: "Portal/Usage/UpgradeModal",
  component: UpgradeModal,
  args: { open: true, onClose: () => {}, target: null },
};
export default meta;
type Story = StoryObj<typeof UpgradeModal>;

// Free user pushed to pay-as-you-go.
export const FromFree: Story = { args: { currentTier: "free" } };

// Pro user with no specific target — generic committed-pricing nudge.
export const FromPro: Story = { args: { currentTier: "pro" } };

// Pro user selecting the enterprise plan — sales-conversation copy.
export const ProToEnterprise: Story = {
  args: { currentTier: "pro", target: enterprisePlan },
};

// Enterprise user routed to their account team.
export const FromEnterprise: Story = { args: { currentTier: "enterprise" } };
