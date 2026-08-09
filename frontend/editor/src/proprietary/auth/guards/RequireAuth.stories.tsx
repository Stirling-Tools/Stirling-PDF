import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { AuthContext } from "@app/auth/context";
import type { AuthContextValue, AuthSession } from "@app/auth/types";
import { RequireAuth } from "@app/auth/guards/RequireAuth";

/**
 * The session gate wrapped around protected route trees. It renders one of
 * three slots depending purely on the auth context: `loading` while the
 * session is still resolving, `fallback` when there is no session, and its
 * children once a session exists.
 *
 * The guard reads only `session` and `loading`, so the stories hand it a slice
 * of the auth context instead of mounting a real provider. Each slot is a
 * labelled panel so it is obvious which branch was taken.
 */

/** Auth context slice; only `session` and `loading` steer this guard. */
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

const meta: Meta<typeof RequireAuth> = {
  title: "Auth/Guards/Require Auth",
  component: RequireAuth,
  parameters: { layout: "centered" },
  args: {
    children: <Panel label="Protected content" />,
    fallback: <Panel label="Login screen (fallback)" />,
    loading: <Panel label="Resolving session…" />,
  },
};
export default meta;
type Story = StoryObj<typeof RequireAuth>;

/** A resolved session: the guard renders the protected tree. */
export const Authenticated: Story = {
  decorators: [withAuth(authValue({ session: activeSession }))],
};

/** No session: the caller's login screen takes over. */
export const SignedOut: Story = {
  decorators: [withAuth(authValue())],
};

/** Session still resolving: neither content nor login screen flashes. */
export const Loading: Story = {
  decorators: [withAuth(authValue({ loading: true }))],
};

/**
 * With no `loading` slot the guard renders nothing until the session
 * resolves, which is how routes that own their own spinner use it.
 */
export const LoadingWithoutSlot: Story = {
  args: { loading: undefined },
  decorators: [withAuth(authValue({ loading: true }))],
};
