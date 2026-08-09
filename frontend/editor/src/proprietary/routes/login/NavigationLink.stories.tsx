import type { Meta, StoryObj } from "@storybook/react-vite";
import NavigationLink from "@app/routes/login/NavigationLink";
import "@app/auth/ui/auth.css";

/**
 * The quiet text link the auth screens use to move between login, signup and
 * password reset. Its only variation is the disabled state, which the screens
 * apply while a submission is in flight so the user cannot navigate away
 * mid-request.
 */
const meta: Meta<typeof NavigationLink> = {
  title: "Auth/Navigation Link",
  component: NavigationLink,
  parameters: { layout: "centered" },
  args: {
    text: "Back to login",
    onClick: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof NavigationLink>;

export const Default: Story = {};

/** Held inert while the surrounding form is submitting. */
export const Disabled: Story = {
  args: { isDisabled: true },
};
