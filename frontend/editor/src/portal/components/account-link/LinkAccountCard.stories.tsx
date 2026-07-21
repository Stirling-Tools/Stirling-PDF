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
  completeLink: async () => {},
  unlink: async () => {},
};

const meta: Meta<typeof LinkAccountCard> = {
  title: "Portal/AccountLink/LinkAccountCard",
  component: LinkAccountCard,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof LinkAccountCard>;

/** Not linked — the "Link your Stirling account" button opens the login modal. */
export const NotLinked: Story = {
  args: { link: base },
};

/** Linking — login completed, button shows progress while registering. */
export const Linking: Story = {
  args: { link: { ...base, phase: "linking" } },
};

/** Linked — status only; the device secret is never shown. */
export const Linked: Story = {
  args: {
    link: { ...base, status: { linked: true, name: "prod-eu-gateway" } },
  },
};

/** SaaS Supabase not configured — explains the in-app dev simulate fallback. */
export const Unconfigured: Story = {
  args: { link: { ...base, loginConfigured: false } },
};

/** Link error surfaced inline. */
export const Error: Story = {
  args: {
    link: {
      ...base,
      phase: "error",
      error: "Couldn't register this instance with the SaaS backend.",
    },
  },
};
