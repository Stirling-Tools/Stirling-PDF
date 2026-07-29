import type { Meta, StoryObj } from "@storybook/react";
import ErrorMessage from "@app/auth/ui/ErrorMessage";
import "@app/auth/ui/auth.css";

/**
 * The inline error banner the auth forms render when a submission fails
 */
const meta: Meta<typeof ErrorMessage> = {
  title: "Auth/Error Message",
  component: ErrorMessage,
  parameters: { layout: "centered" },
  args: {
    error: "Invalid email or password.",
  },
};
export default meta;
type Story = StoryObj<typeof ErrorMessage>;

export const Default: Story = {};

export const LongMessage: Story = {
  args: {
    error:
      "We couldn't sign you in because your account has been temporarily locked after too many failed attempts. Please try again in a few minutes.",
  },
};

export const Empty: Story = {
  args: {
    error: null,
  },
};
