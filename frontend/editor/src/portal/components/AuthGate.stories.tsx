import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Decorator } from "@storybook/react-vite";
import { AuthContext, type AuthContextValue } from "@app/auth";
import { AuthGate } from "@portal/components/AuthGate";

const mockSession: AuthContextValue["session"] = {
  user: {
    id: "user-1",
    email: "reece@stirlingpdf.com",
    username: "reece",
    role: "USER",
    portalAccess: true,
  },
  access_token: "storybook-fake-jwt",
  expires_in: 3600,
};

function withAuth(value: Partial<AuthContextValue>): Decorator {
  const fullValue: AuthContextValue = {
    session: null,
    user: null,
    displayName: null,
    isAnonymous: false,
    isAdmin: false,
    portalAccess: false,
    role: null,
    loading: false,
    error: null,
    signOut: async () => {},
    refreshSession: async () => {},
    ...value,
  };
  return (Story) => (
    <AuthContext.Provider value={fullValue}>
      <Story />
    </AuthContext.Provider>
  );
}

const meta = {
  title: "Portal/AuthGate",
  component: AuthGate,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AuthGate>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Signed in with portal access: the gate steps aside and renders children. */
export const Default: Story = {
  args: {
    children: <div style={{ padding: "2rem" }}>Portal content.</div>,
  },
  decorators: [
    withAuth({ session: mockSession, portalAccess: true, role: "USER" }),
  ],
};

/** Session still resolving: shows the loading spinner. */
export const Loading: Story = {
  args: {
    children: <div>Portal content.</div>,
  },
  decorators: [withAuth({ loading: true })],
};

/** No session: renders the login screen. */
export const LoggedOut: Story = {
  args: {
    children: <div>Portal content.</div>,
  },
  decorators: [withAuth({ session: null })],
};

/** Authenticated but lacking portal access: shows the redirecting message
 *  (the actual redirect to the editor is a side effect, not exercised here). */
export const Forbidden: Story = {
  args: {
    children: <div>Portal content.</div>,
  },
  decorators: [
    withAuth({ session: mockSession, portalAccess: false, role: "USER" }),
  ],
};
