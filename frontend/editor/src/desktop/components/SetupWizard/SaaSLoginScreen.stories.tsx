/**
 * Signing in to a Stirling account from the desktop wizard. Sibling of the
 * self-hosted screen, but with extra ways out: switching to signup, dropping
 * to a self-hosted server, or skipping sign-in entirely when the wizard allows
 * it. Each of those is a prop the wizard may or may not pass.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SaaSLoginScreen } from "@app/components/SetupWizard/SaaSLoginScreen";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";

const meta: Meta<typeof SaaSLoginScreen> = {
  title: "Desktop/SetupWizard/SaaSLoginScreen",
  component: SaaSLoginScreen,
  parameters: { layout: "padded" },
  // The wizard's wordmark resolves a logo variant through PreferencesContext.
  decorators: [
    (Story) => (
      <PreferencesProvider>
        <Story />
      </PreferencesProvider>
    ),
  ],
  args: {
    serverUrl: "https://app.stirlingpdf.com",
    onLogin: async () => {},
    onOAuthSuccess: async () => {},
    onSelfHostedClick: () => {},
    onSwitchToSignup: () => {},
    loading: false,
    error: null,
  },
};
export default meta;

type Story = StoryObj<typeof SaaSLoginScreen>;

export const Default: Story = {};

/** First run, where the wizard offers a way to skip signing in. */
export const WithSkipOption: Story = { args: { onSkipSignIn: () => {} } };

/** Opened from inside the app, so it can be dismissed. */
export const Dismissible: Story = { args: { onClose: () => {} } };

export const WithError: Story = {
  args: { error: "We could not sign you in with those details." },
};

/** Signing in, which disables the form while the request is out. */
export const Loading: Story = { args: { loading: true } };

/** Every optional route offered at once, which is the busiest this screen gets. */
export const AllOptions: Story = {
  args: { onSkipSignIn: () => {}, onClose: () => {} },
};
