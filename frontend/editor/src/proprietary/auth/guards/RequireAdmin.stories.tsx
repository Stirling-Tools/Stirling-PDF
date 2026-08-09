import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { AuthContext } from "@app/auth/context";
import type { AuthContextValue, AuthSession } from "@app/auth/types";
import { RequireAdmin } from "@app/auth/guards/RequireAdmin";

/**
 * The admin gate around the settings and processor route trees. Three fields
 * of the auth context decide what it renders: while `loading` it shows the
 * `loading` slot, with no session it shows `fallback`, and for a signed-in
 * user who is not an admin it shows `forbidden` while calling `onForbidden`
 * so the route can redirect. Only an authenticated admin sees the children.
 *
 * The guard reads three fields, so the stories supply a slice of the auth
 * context rather than mounting a real provider, and each slot renders as a
 * labelled panel so the branch taken is visible.
 */

/** Auth context slice; `session`, `loading` and `isAdmin` steer this guard. */
function authValue(
  overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
  return {
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
    ...overrides,
  };
}

const activeSession: AuthSession = {
  user: { id: "1", email: "ada@example.com", username: "ada", role: "USER" },
  access_token: "storybook-token",
  expires_in: 3600,
};

/** Labelled stand-in for whichever slot the guard chose to render. */
function Panel({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "1.5rem",
        borderRadius: "0.75rem",
        border: "1px solid var(--c-border)",
        background: "var(--c-surface)",
        color: "var(--c-text)",
        textAlign: "center",
      }}
    >
      {label}
    </div>
  );
}

function withAuth(value: AuthContextValue): Decorator {
  return (Story) => (
    <AuthContext.Provider value={value}>
      <Story />
    </AuthContext.Provider>
  );
}

const meta: Meta<typeof RequireAdmin> = {
  title: "Auth/Guards/Require Admin",
  component: RequireAdmin,
  parameters: { layout: "centered" },
  args: {
    children: <Panel label="Admin content" />,
    fallback: <Panel label="Login screen (fallback)" />,
    forbidden: <Panel label="Redirecting away…" />,
    loading: <Panel label="Resolving session…" />,
    onForbidden: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof RequireAdmin>;

/** An authenticated admin: the guarded tree renders. */
export const Admin: Story = {
  decorators: [withAuth(authValue({ session: activeSession, isAdmin: true }))],
};

/**
 * Signed in without the admin role. `onForbidden` fires so the route can send
 * the user back to the editor; the forbidden slot covers the gap until it does.
 */
export const NotAdmin: Story = {
  decorators: [withAuth(authValue({ session: activeSession }))],
};

/** No session at all: the login screen takes over, no redirect is triggered. */
export const SignedOut: Story = {
  decorators: [withAuth(authValue())],
};

/**
 * Session still resolving. The redirect is deliberately held back here — a
 * half-loaded session must not be mistaken for a non-admin one.
 */
export const Loading: Story = {
  decorators: [withAuth(authValue({ loading: true }))],
};
