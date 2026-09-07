import type { Meta, StoryObj } from "@storybook/react-vite";
import GeneralSection from "@app/components/shared/config/configSections/GeneralSection";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ThemeProvider } from "@app/components/shared/ThemeProvider";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";

// Reads theme/tool-panel preferences via usePreferences()/useTheme() and server
// config via useAppConfig() — none of which the Storybook preview's own provider
// tree supplies (those are the portal contexts), so wrap here. AppConfigProvider
// uses autoFetch off so stories render a fixed config instead of hitting the API.
const meta = {
  title: "Shared/Config/ConfigSections/GeneralSection",
  component: GeneralSection,
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
} satisfies Meta<typeof GeneralSection>;
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
