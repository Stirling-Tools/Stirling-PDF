import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SupabaseLoginState } from "@app/auth/ui/useSupabaseLogin";
import { ConnectSignInSlide } from "@portal/components/account-link/connect/ConnectSignInSlide";

const noop = () => {};

/** Idle login state. Providers are empty, which is the self-hosted default: see saasSupabase. */
const login: SupabaseLoginState = {
  email: "",
  setEmail: noop,
  password: "",
  setPassword: noop,
  error: null,
  setError: noop,
  isSubmitting: false,
  providers: [],
  hasProviders: false,
  signInWithEmail: async () => {},
  signInWithProvider: async () => {},
};

const meta: Meta<typeof ConnectSignInSlide> = {
  title: "Portal/AccountLink/Connect/SignInSlide",
  component: ConnectSignInSlide,
  args: { login },
};
export default meta;
type Story = StoryObj<typeof ConnectSignInSlide>;

/** Email and password only, the state a customer-hosted origin always gets. */
export const Default: Story = {};

/**
 * With OAuth, which only appears where the origin is on the Supabase redirect allow-list. Anywhere
 * else the round trip finishes on the SaaS site and this instance never receives a session.
 */
export const WithOAuth: Story = {
  args: {
    login: {
      ...login,
      providers: ["google", "github", "apple", "azure"],
      hasProviders: true,
    },
  },
};

/** The register call failed after a good sign-in, so the error belongs beside the form. */
export const LinkFailed: Story = {
  args: { linkError: "Upstream rejected the token" },
};

/** Re-auth: an expired session on an instance that stays linked. */
export const Reauth: Story = {
  args: { reauth: true },
};
