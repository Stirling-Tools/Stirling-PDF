import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthContext } from "@app/auth/context";
import type { AuthContextValue, AuthUser } from "@app/auth/types";
import LoggedInState from "@app/routes/login/LoggedInState";

/**
 * The interstitial the login route shows when someone who already has a
 * session lands on it: a confirmation card naming the signed-in address,
 * which redirects to the workspace a couple of seconds later.
 *
 * It reads only the user off the auth context, so the stories supply a slice
 * of that context rather than mounting a real provider. The redirect timer
 * still runs; in Storybook there is nowhere to navigate to, so the card stays
 * on screen.
 */

/** Minimal auth context slice — only `user` is read by this screen. */
function authValue(user: AuthUser | null): AuthContextValue {
  return {
    session: null,
    user,
    displayName: user?.username ?? null,
    isAnonymous: false,
    isAdmin: false,
    portalAccess: false,
    role: user?.role ?? null,
    loading: false,
    error: null,
    signOut: async () => {},
    refreshSession: async () => {},
  };
}

const signedInUser: AuthUser = {
  id: "1",
  email: "ada@example.com",
  username: "ada",
  role: "USER",
};

const meta: Meta<typeof LoggedInState> = {
  title: "Auth/Logged In State",
  component: LoggedInState,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof LoggedInState>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <AuthContext.Provider value={authValue(signedInUser)}>
        <Story />
      </AuthContext.Provider>
    ),
  ],
};

/**
 * Sessions without an email address — anonymous or SSO users the backend
 * returns no address for — leave the label with nothing after the colon.
 */
export const WithoutEmail: Story = {
  decorators: [
    (Story) => (
      <AuthContext.Provider value={authValue({ ...signedInUser, email: "" })}>
        <Story />
      </AuthContext.Provider>
    ),
  ],
};
