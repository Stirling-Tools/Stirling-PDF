import type { Meta, StoryObj } from "@storybook/react-vite";
import { ManageBillingButton } from "@app/components/shared/ManageBillingButton";

/**
 * Button that opens the Stripe billing portal for the current license.
 */
const meta = {
  title: "Shared/ManageBillingButton",
  component: ManageBillingButton,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ManageBillingButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Custom return URL to redirect back to once the billing portal session ends. */
export const CustomReturnUrl: Story = {
  args: {
    returnUrl: "https://stirlingpdf.com/account",
  },
};
