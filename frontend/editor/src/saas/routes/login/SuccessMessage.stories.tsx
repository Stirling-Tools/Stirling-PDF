import type { Meta, StoryObj } from "@storybook/react-vite";
import SuccessMessage from "./SuccessMessage";
import "@app/auth/ui/auth.css";

/**
 * The confirmation banner the cloud auth screens render after a request that
 * has no immediate next step — a magic link sent, a reset email dispatched.
 * It is the mirror of the auth error banner: a single message, or nothing at
 * all when there is none to show.
 *
 * The component is imported by path rather than through `@app/*` because it
 * lives only in the SaaS layer, which the shared Storybook does not alias.
 */
const meta: Meta<typeof SuccessMessage> = {
  title: "Auth/Success Message",
  component: SuccessMessage,
  parameters: { layout: "centered" },
  args: {
    success: "Check your inbox — we've sent you a sign-in link.",
  },
};
export default meta;
type Story = StoryObj<typeof SuccessMessage>;

export const Default: Story = {};

/** Longer copy wraps inside the banner rather than stretching the card. */
export const LongMessage: Story = {
  args: {
    success:
      "We've emailed a sign-in link to you. It expires in 15 minutes, so if it stops working just request another one from this screen.",
  },
};

/** With no message the component renders nothing, leaving no reserved space. */
export const Empty: Story = {
  args: { success: null },
};
