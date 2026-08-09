import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { AuthContext } from "@app/auth/context";
import type { AuthContextValue, AuthSession } from "@app/auth/types";
import { RequirePortalAccess } from "@app/auth/guards/RequirePortalAccess";

/**
 * The processor/portal gate. It mirrors the admin guard but keys off
 * `portalAccess`, the backend grant that covers admins plus anyone given
 * access explicitly: `loading` while the session resolves, `fallback` when
 * signed out, and `forbidden` (alongside a call to `onForbidden`) for a
 * signed-in user without the grant.
 *
 * The guard reads three context fields, so the stories supply a slice of the
 * auth context rather than mounting a real provider, and each slot renders as
 * a labelled panel so the branch taken is visible.
 */

/**
 * Auth context slice; `session`, `loading` and `portalAccess` steer this guard.
 */
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

const meta: Meta<typeof RequirePortalAccess> = {
  title: "Auth/Guards/Require Portal Access",
  component: RequirePortalAccess,
  parameters: { layout: "centered" },
  args: {
    children: <Panel label="Processor content" />,
    fallback: <Panel label="Login screen (fallback)" />,
    forbidden: <Panel label="Redirecting away…" />,
    loading: <Panel label="Resolving session…" />,
    onForbidden: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof RequirePortalAccess>;

/** The grant is present: the processor renders. */
export const WithAccess: Story = {
  decorators: [
    withAuth(authValue({ session: activeSession, portalAccess: true })),
  ],
};

/**
 * Signed in without the grant. `onForbidden` fires so the route can send the
 * user back to the editor; the forbidden slot covers the gap until it does.
 */
export const WithoutAccess: Story = {
  decorators: [withAuth(authValue({ session: activeSession }))],
};

/** No session at all: the login screen takes over, no redirect is triggered. */
export const SignedOut: Story = {
  decorators: [withAuth(authValue())],
};

/**
 * Session still resolving. The redirect is deliberately held back here — an
 * unresolved session must not be mistaken for a missing grant.
 */
export const Loading: Story = {
  decorators: [withAuth(authValue({ loading: true }))],
};
