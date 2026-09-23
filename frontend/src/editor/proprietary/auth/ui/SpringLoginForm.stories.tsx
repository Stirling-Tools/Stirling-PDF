import type { Meta, StoryObj } from "@storybook/react-vite";
import SpringLoginForm from "@app/auth/ui/SpringLoginForm";
import type { SpringLoginState } from "@app/auth/ui/useSpringLogin";
import loginHeader from "@app/assets/brand/modern-logo/LoginLightModeHeader.svg";
import "@app/auth/ui/auth.css";

/** Builds a mock useSpringLogin() state; stories override just the fields they need. */
function mockState(
  overrides: Partial<SpringLoginState> = {},
): SpringLoginState {
  return {
    email: "",
    setEmail: () => {},
    password: "",
    setPassword: () => {},
    mfaCode: "",
    setMfaCode: () => {},
    requiresMfa: false,
    error: null,
    setError: () => {},
    isSubmitting: false,
    providers: [],
    loginMethod: "all",
    isUserPassAllowed: true,
    hasProviders: false,
    signInWithEmail: async () => {},
    signInWithProvider: async () => {},
    ...overrides,
  };
}

/**
 * The shared Spring login form body: logo, error, OAuth buttons, divider, and
 * the email/password form. Rendered by both the editor and the portal inside
 * their own auth shells.
 */
const meta = {
  title: "Auth/Spring Login Form",
  component: SpringLoginForm,
  parameters: { layout: "centered" },
  args: {
    state: mockState(),
    logoSrc: loginHeader,
    logoAlt: "Stirling PDF",
  },
} satisfies Meta<typeof SpringLoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div style={{ width: 360 }}>
      <SpringLoginForm {...args} />
    </div>
  ),
};

export const WithOAuthProviders: Story = {
  args: {
    state: mockState({
      providers: ["google", "github"],
      hasProviders: true,
    }),
  },
  render: (args) => (
    <div style={{ width: 360 }}>
      <SpringLoginForm {...args} />
    </div>
  ),
};

export const WithError: Story = {
  args: {
    state: mockState({
      email: "user@example.com",
      error: "Invalid email or password.",
    }),
  },
  render: (args) => (
    <div style={{ width: 360 }}>
      <SpringLoginForm {...args} />
    </div>
  ),
};

export const RequiresMfa: Story = {
  args: {
    state: mockState({
      email: "user@example.com",
      requiresMfa: true,
    }),
  },
  render: (args) => (
    <div style={{ width: 360 }}>
      <SpringLoginForm {...args} />
    </div>
  ),
};
