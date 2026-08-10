import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkGate } from "@portal/components/account-link/LinkGate";

const meta: Meta<typeof LinkGate> = {
  title: "Portal/AccountLink/LinkGate",
  component: LinkGate,
  args: {
    feature: "Pipelines",
    children: <p>The feature, rendered once the account is connected.</p>,
  },
};
export default meta;
type Story = StoryObj<typeof LinkGate>;

/**
 * Passthrough. The gate reads the capability from the backend app-config, which Storybook has no
 * handler for, so it falls through to the children — the same behaviour a server with the
 * account-link flag off gets, where gating would lock the feature with no way to unlock it.
 */
export const Passthrough: Story = {};
