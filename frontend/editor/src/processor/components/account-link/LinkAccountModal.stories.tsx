import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkAccountModal } from "@processor/components/account-link/LinkAccountModal";

const meta: Meta<typeof LinkAccountModal> = {
  title: "Processor/AccountLink/LinkAccountModal",
  component: LinkAccountModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onClose: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof LinkAccountModal>;

/**
 * "link" mode — explains the trip to Stirling and starts the handshake. There is no
 * sign-in form: a sign-in started on a self-hosted origin cannot complete, because
 * the provider will not redirect back to a hostname it does not know.
 */
export const Default: Story = {};

/** "reauth" mode — the server stays linked; only the browser session is renewed. */
export const Reauth: Story = {
  args: { mode: "reauth" },
};
