/**
 * The escape hatch at the bottom of the desktop sign-in screen, for people
 * connecting to their own server rather than a Stirling account.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SelfHostedLink } from "@app/components/SetupWizard/SelfHostedLink";

const meta: Meta<typeof SelfHostedLink> = {
  title: "Desktop/SetupWizard/SelfHostedLink",
  component: SelfHostedLink,
  parameters: { layout: "centered" },
  args: { onClick: () => {} },
};
export default meta;

type Story = StoryObj<typeof SelfHostedLink>;

export const Default: Story = {};

/** Disabled while the wizard is mid-request. */
export const Disabled: Story = { args: { disabled: true } };
