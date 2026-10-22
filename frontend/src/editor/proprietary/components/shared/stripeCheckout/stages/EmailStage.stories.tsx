import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmailStage } from "@app/components/shared/stripeCheckout/stages/EmailStage";

/**
 * The email-collection step of the Stripe checkout flow.
 */
const meta = {
  title: "StripeCheckout/EmailStage",
  component: EmailStage,
  parameters: { layout: "centered" },
  args: {
    emailInput: "",
    setEmailInput: () => {},
    emailError: "",
    onSubmit: () => {},
  },
} satisfies Meta<typeof EmailStage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Filled: Story = {
  args: {
    emailInput: "jane@example.com",
  },
};

export const WithError: Story = {
  args: {
    emailInput: "not-an-email",
    emailError: "Please enter a valid email address",
  },
};
