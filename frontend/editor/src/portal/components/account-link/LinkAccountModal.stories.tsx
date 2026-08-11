import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkAccountModal } from "@portal/components/account-link/LinkAccountModal";

const meta: Meta<typeof LinkAccountModal> = {
  title: "Portal/AccountLink/LinkAccountModal",
  component: LinkAccountModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onClose: () => {},
    onLinked: async () => {},
  },
};
export default meta;
type Story = StoryObj<typeof LinkAccountModal>;

/**
 * Default "link" mode: the server shows a pairing code and waits for a team owner
 * to approve it. Driven by the MSW pair handlers, which settle on linked after a
 * couple of polls, so this story moves on its own.
 */
export const Default: Story = {};

/**
 * "reauth" mode: the instance is already linked and only the browser's SaaS
 * session lapsed, so this one keeps the in-app sign-in rather than pairing again.
 */
export const Reauth: Story = {
  args: { mode: "reauth" },
};
