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

/** Default "link" mode — sign in to register this instance against a Stirling account. */
export const Default: Story = {};

/** "reauth" mode — an already-linked instance's session expired and needs a fresh sign-in. */
export const Reauth: Story = {
  args: { mode: "reauth" },
};
