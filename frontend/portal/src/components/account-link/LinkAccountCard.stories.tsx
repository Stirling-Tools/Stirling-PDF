import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Session } from "@portal/auth/supabaseLink";
import type { UseAccountLink } from "@portal/hooks/useAccountLink";
import { LinkAccountCard } from "@portal/components/account-link/LinkAccountCard";
import "@portal/views/AccountLink.css";

// A no-op UseAccountLink for static stories; overridden per story.
const base: UseAccountLink = {
  supabaseConfigured: true,
  session: null,
  phase: "idle",
  error: null,
  credential: null,
  authenticate: async () => {},
  register: async () => {},
  clearCredential: () => {},
  logout: async () => {},
};

const fakeSession = { access_token: "demo" } as Session;

const meta: Meta<typeof LinkAccountCard> = {
  title: "Portal/AccountLink/LinkAccountCard",
  component: LinkAccountCard,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof LinkAccountCard>;

/** Signed out, Supabase configured — shows the sign-in form. */
export const SignIn: Story = {
  args: { link: base },
};

/** Supabase not wired — explains the assumption; register still available. */
export const Unconfigured: Story = {
  args: { link: { ...base, supabaseConfigured: false } },
};

/** Signed in — shows the register-instance step. */
export const SignedIn: Story = {
  args: { link: { ...base, session: fakeSession } },
};

/** Registration succeeded — one-time device secret shown. */
export const CredentialIssued: Story = {
  args: {
    link: {
      ...base,
      session: fakeSession,
      phase: "registered",
      credential: {
        instanceId: 1004,
        deviceId: "8f2c1d4a-6b3e-4a9f-9c10-2d5e7f1a0b34",
        deviceSecret: "sk_link_3f9a2b7c1d4e5f60718293a4b5c6d7e8",
        name: "prod-eu-gateway",
      },
    },
  },
};

/** Auth error surfaced inline. */
export const Error: Story = {
  args: {
    link: { ...base, phase: "error", error: "Invalid login credentials" },
  },
};
