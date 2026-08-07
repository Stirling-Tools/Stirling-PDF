import type { Meta, StoryObj } from "@storybook/react-vite";
import NavigationLink from "@app/routes/login/NavigationLink";

/**
 * The secondary action beneath a login form — "create an account", "forgot
 * your password". A real button rather than an anchor, because it moves
 * between auth steps rather than navigating to a URL.
 */
const meta: Meta<typeof NavigationLink> = {
  title: "Proprietary/Login/NavigationLink",
  component: NavigationLink,
  parameters: { layout: "centered" },
  args: { onClick: () => {} },
};
export default meta;

type Story = StoryObj<typeof NavigationLink>;

/** The usual prompt. */
export const Default: Story = { args: { text: "Create an account" } };

/** Password recovery. */
export const ForgotPassword: Story = {
  args: { text: "Forgot your password?" },
};

/** Disabled while a request is in flight — shown rather than hidden, so the
 *  route out of the step stays visible. */
export const Disabled: Story = {
  args: { text: "Create an account", isDisabled: true },
};

/** Longer copy, to check it stays on one line under the form. */
export const LongText: Story = {
  args: { text: "Sign in with your organisation's identity provider instead" },
};
