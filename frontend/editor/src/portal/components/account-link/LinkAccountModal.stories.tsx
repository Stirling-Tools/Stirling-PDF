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

/** Step 1: the case for connecting. Click through to reach sign-in. */
export const Default: Story = {};

/**
 * Step 3, reached because the instance already reports linked. The balance needs a wallet call
 * that has no MSW handler, so it is omitted here.
 */
export const Connected: Story = {
  args: { status: { linked: true, name: "acme-corp" } },
};

/** A register failure after a good sign-in, shown on the sign-in step. */
export const LinkFailed: Story = {
  args: { linkError: "Upstream rejected the token" },
};

/** "reauth" mode: an already-linked instance's session expired. Single step, no pitch. */
export const Reauth: Story = {
  args: { mode: "reauth" },
};
