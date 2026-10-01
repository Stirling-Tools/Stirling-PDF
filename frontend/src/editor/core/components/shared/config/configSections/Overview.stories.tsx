import type { Meta, StoryObj } from "@storybook/react-vite";
import Overview from "@app/components/shared/config/configSections/Overview";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";

// Reads config via useAppConfig() — no props. Wrap in AppConfigProvider with
// autoFetch off so stories render a fixed config instead of hitting the API.
const meta = {
  title: "Shared/Config/Overview",
  component: Overview,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Overview>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No config resolved yet (default context state) — shows the loading spinner. */
export const Default: Story = {};

/** Config loaded — renders the basic/security/system/integration sections. */
export const Loaded: Story = {
  decorators: [
    (StoryComponent) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{
          appNameNavbar: "Stirling PDF",
          baseUrl: "https://stirlingpdf.example.com",
          contextPath: "/",
          serverPort: 8080,
          enableLogin: true,
          enableAlphaFunctionality: false,
          enableAnalytics: true,
          SSOAutoLogin: false,
        }}
      >
        <StoryComponent />
      </AppConfigProvider>
    ),
  ],
};

/** Config resolved but carrying a server-reported warning. */
export const WithWarning: Story = {
  decorators: [
    (StoryComponent) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{
          appNameNavbar: "Stirling PDF",
          enableLogin: true,
          error: "Failed to load some settings from disk; using defaults.",
        }}
      >
        <StoryComponent />
      </AppConfigProvider>
    ),
  ],
};
