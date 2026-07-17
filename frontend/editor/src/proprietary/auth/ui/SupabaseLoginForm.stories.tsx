import type { Meta, StoryObj } from "@storybook/react";
import SupabaseLoginForm from "@app/auth/ui/SupabaseLoginForm";
import type { SupabaseLoginState } from "@app/auth/ui/useSupabaseLogin";
import "@app/auth/ui/auth.css";

/**
 * Login form combining SSO buttons and email/password, driven by a
 * {@link SupabaseLoginState} from useSupabaseLogin.
 */
const meta: Meta<typeof SupabaseLoginForm> = {
  title: "Auth/Supabase Login Form",
  component: SupabaseLoginForm,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof SupabaseLoginForm>;

function makeState(
  overrides: Partial<SupabaseLoginState> = {},
): SupabaseLoginState {
  return {
    email: "",
    setEmail: () => {},
    password: "",
    setPassword: () => {},
    error: null,
    setError: () => {},
    isSubmitting: false,
    providers: ["google", "github"],
    hasProviders: true,
    signInWithEmail: async () => {},
    signInWithProvider: async () => {},
    ...overrides,
  };
}

export const Default: Story = {
  args: {
    state: makeState(),
  },
};

export const NoProviders: Story = {
  args: {
    state: makeState({ providers: [], hasProviders: false }),
  },
};

export const WithError: Story = {
  args: {
    state: makeState({
      email: "user@example.com",
      error: "Invalid email or password.",
    }),
  },
};

export const Submitting: Story = {
  args: {
    state: makeState({
      email: "user@example.com",
      password: "hunter2",
      isSubmitting: true,
    }),
  },
};
