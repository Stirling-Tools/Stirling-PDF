import type { Meta, StoryObj } from "@storybook/react-vite";
import GeneralWithLoginLanding from "@app/components/shared/config/GeneralWithLoginLanding";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ThemeProvider } from "@app/components/shared/ThemeProvider";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";

// Wraps GeneralSection, which reads theme/tool-panel preferences via
// usePreferences()/useTheme() and server config via useAppConfig() — none of
// which the Storybook preview's own provider tree supplies (those are the
// portal contexts), so wrap here. AppConfigProvider uses autoFetch off so
// stories render a fixed config instead of hitting the API. The login-landing
// control itself stays hidden (loginLandingMode() defaults to non-"dynamic"
// in this build), so only the General section is visible.
const meta = {
  title: "Config/GeneralWithLoginLanding",
  component: GeneralWithLoginLanding,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <PreferencesProvider>
        <ThemeProvider>
          <Story />
        </ThemeProvider>
      </PreferencesProvider>
    ),
  ],
} satisfies Meta<typeof GeneralWithLoginLanding>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Login enabled, no backend version known yet — Software Updates section and admin banner stay hidden. */
export const Default: Story = {
  decorators: [
    (StoryComponent) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{ enableLogin: true }}
      >
        <StoryComponent />
      </AppConfigProvider>
    ),
  ],
};

/** Backend version known — shows the Software Updates section with version info. */
export const WithBackendVersion: Story = {
  decorators: [
    (StoryComponent) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{ enableLogin: true, appVersion: "1.2.3" }}
      >
        <StoryComponent />
      </AppConfigProvider>
    ),
  ],
};

/** Login disabled — the "For System Administrators" banner shows, prompting the env vars to enable it. */
export const AdminBanner: Story = {
  decorators: [
    (StoryComponent) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{ enableLogin: false }}
      >
        <StoryComponent />
      </AppConfigProvider>
    ),
  ],
};
