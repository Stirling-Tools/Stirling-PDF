/**
 * Continue-without-an-account button on the SaaS auth screens.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import GuestSignInButton from "@app/routes/authShared/GuestSignInButton";

const meta: Meta<typeof GuestSignInButton> = {
  title: "SaaS/Auth/GuestSignInButton",
  component: GuestSignInButton,
  parameters: { layout: "padded" },
  args: { label: "Continue as guest", onClick: () => {} },
};
export default meta;

type Story = StoryObj<typeof GuestSignInButton>;

export const Default: Story = {};

/** Disabled while a sign-in request is in flight. */
export const Disabled: Story = { args: { disabled: true } };

/** The button is full width, so a long label wraps inside it. */
export const LongLabel: Story = {
  args: { label: "Continue without an account for now" },
};
