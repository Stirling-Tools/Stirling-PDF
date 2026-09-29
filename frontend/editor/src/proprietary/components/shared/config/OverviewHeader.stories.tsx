import type { Meta, StoryObj } from "@storybook/react-vite";
import { OverviewHeader } from "@app/components/shared/config/OverviewHeader";
import { AuthContext } from "@app/auth/context";
import type { AuthContextValue } from "@app/auth/types";

/**
 * Header for the application configuration page: title, description, and
 * (when signed in) the current user's email plus a log-out button.
 */
const meta: Meta<typeof OverviewHeader> = {
  title: "Config/OverviewHeader",
  component: OverviewHeader,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

const signedInAuth: AuthContextValue = {
  session: null,
  user: {
    id: "user-1",
    email: "jane.doe@example.com",
    username: "jane.doe",
    role: "ROLE_USER",
  },
  displayName: "jane.doe",
  isAnonymous: false,
  isAdmin: false,
  portalAccess: false,
  role: "ROLE_USER",
  loading: false,
  error: null,
  signOut: async () => {},
  refreshSession: async () => {},
};

/** Signed out: no email line, no log-out button. */
export const Default: Story = {};

/** Signed in: shows the current user's email and a log-out button. */
export const SignedIn: Story = {
  decorators: [
    (Story) => (
      <AuthContext.Provider value={signedInAuth}>
        <Story />
      </AuthContext.Provider>
    ),
  ],
};
