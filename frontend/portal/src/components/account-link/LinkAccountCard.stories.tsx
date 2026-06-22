import type { Meta, StoryObj } from "@storybook/react-vite";
import type { UseAccountLink } from "@portal/hooks/useAccountLink";
import { LinkAccountCard } from "@portal/components/account-link/LinkAccountCard";
import "@portal/views/AccountLink.css";

// A no-op UseAccountLink for static stories; overridden per story.
const base: UseAccountLink = {
  loginConfigured: true,
  status: { linked: false, name: null },
  phase: "idle",
  error: null,
  link: async () => {},
  unlink: async () => {},
};

const meta: Meta<typeof LinkAccountCard> = {
  title: "Portal/AccountLink/LinkAccountCard",
  component: LinkAccountCard,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof LinkAccountCard>;

/** Not linked — shows the "Link your Stirling account" popup button. */
export const NotLinked: Story = {
  args: { link: base },
};

/** Linking — popup open, button shows progress. */
export const Linking: Story = {
  args: { link: { ...base, phase: "linking" } },
};

/** Linked — status only; the device secret is never shown. */
export const Linked: Story = {
  args: {
    link: { ...base, status: { linked: true, name: "prod-eu-gateway" } },
  },
};

/** SaaS login URL not configured — explains the dev stub fallback. */
export const Unconfigured: Story = {
  args: { link: { ...base, loginConfigured: false } },
};

/** Link error surfaced inline. */
export const Error: Story = {
  args: {
    link: {
      ...base,
      phase: "error",
      error: "Login window closed before linking finished.",
    },
  },
};
