/**
 * The confirmation strip above the SaaS login form. Renders nothing at all
 * when there is no message, which is its usual state.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import SuccessMessage from "@app/routes/login/SuccessMessage";

const meta: Meta<typeof SuccessMessage> = {
  title: "SaaS/Login/SuccessMessage",
  component: SuccessMessage,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof SuccessMessage>;

export const Default: Story = {
  args: { success: "Check your inbox — we sent you a sign-in link." },
};

/** Longer copy wraps rather than stretching the strip. */
export const LongMessage: Story = {
  args: {
    success:
      "Your password has been reset. Sign in with your new password, and if you did not request this, contact support straight away.",
  },
};

/** No message: the component renders nothing. */
export const Empty: Story = { args: { success: null } };
