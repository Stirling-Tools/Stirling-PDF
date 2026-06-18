import type { Meta, StoryObj } from "@storybook/react-vite";
import { AvailablePlans } from "@portal/components/usage/AvailablePlans";
import { PLAN_OPTIONS } from "@portal/mocks/usage";

const meta: Meta<typeof AvailablePlans> = {
  title: "Portal/Usage/AvailablePlans",
  component: AvailablePlans,
  args: { plans: PLAN_OPTIONS, onSelect: () => {} },
};
export default meta;
type Story = StoryObj<typeof AvailablePlans>;

export const OnFree: Story = { args: { current: "free" } };

export const OnPro: Story = { args: { current: "pro" } };

export const OnEnterprise: Story = { args: { current: "enterprise" } };
