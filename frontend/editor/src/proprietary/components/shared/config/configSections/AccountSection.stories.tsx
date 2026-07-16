import type { Meta, StoryObj } from "@storybook/react-vite";
import AccountSection from "@app/components/shared/config/configSections/AccountSection";
import { AuthContext } from "@app/auth/context";
import type { AuthContextValue } from "@app/auth/types";
import { accountService } from "@app/services/accountService";

/**
 * Account settings panel shown inside the app config modal: password /
 * username management and two-factor authentication setup.
 */
const meta: Meta<typeof AccountSection> = {
  title: "Config/AccountSection",
  component: AccountSection,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

// AccountSection reads its user through useAuth() and fetches MFA status
// through accountService on mount rather than taking props, so stories drive
// those states directly through the same seams the component calls through.
const standardAuth: AuthContextValue = {
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

const ssoAuth: AuthContextValue = {
  ...standardAuth,
  user: {
    ...standardAuth.user!,
    email: "jane.doe@acme-corp.com",
    authenticationType: "sso",
  },
};

accountService.getAccountData = async () => ({
  username: "jane.doe",
  role: "ROLE_USER",
  settings: "{}",
  changeCredsFlag: false,
  oAuth2Login: false,
  saml2Login: false,
  mfaEnabled: false,
});

/** Standard account with password/username management and 2FA available to enable. */
export const Default: Story = {
  decorators: [
    (Story) => (
      <AuthContext.Provider value={standardAuth}>
        <Story />
      </AuthContext.Provider>
    ),
  ],
};

/** Two-factor authentication already enabled: shows the disable action instead. */
export const MfaEnabled: Story = {
  decorators: [
    (Story) => {
      accountService.getAccountData = async () => ({
        username: "jane.doe",
        role: "ROLE_USER",
        settings: "{}",
        changeCredsFlag: false,
        oAuth2Login: false,
        saml2Login: false,
        mfaEnabled: true,
      });
      return (
        <AuthContext.Provider value={standardAuth}>
          <Story />
        </AuthContext.Provider>
      );
    },
  ],
};

/** SSO-managed account: password/username changes and 2FA are hidden behind identity-provider notices. */
export const SsoUser: Story = {
  decorators: [
    (Story) => (
      <AuthContext.Provider value={ssoAuth}>
        <Story />
      </AuthContext.Provider>
    ),
  ],
};
