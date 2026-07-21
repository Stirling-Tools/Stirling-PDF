import type { Meta, StoryObj } from "@storybook/react-vite";
import LegalSection from "@app/components/shared/config/configSections/LegalSection";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";

// Reads legal document links and the analytics flag via useAppConfig() (the
// preview's own provider tree doesn't supply this — that's the portal
// context), so wrap here. AppConfigProvider uses autoFetch off so stories
// render a fixed config instead of hitting the API.
const meta = {
  title: "Shared/Config/ConfigSections/LegalSection",
  component: LegalSection,
  parameters: { layout: "padded" },
} satisfies Meta<typeof LegalSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** All optional legal documents configured, analytics disabled — no Cookie Preferences card. */
export const Default: Story = {
  decorators: [
    (StoryComponent) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{
          enableAnalytics: false,
          privacyPolicy: "https://example.com/privacy",
          termsAndConditions: "https://example.com/terms",
          accessibilityStatement: "https://example.com/accessibility",
          cookiePolicy: "https://example.com/cookies",
          impressum: "https://example.com/impressum",
        }}
      >
        <StoryComponent />
      </AppConfigProvider>
    ),
  ],
};

/** Analytics enabled — adds the Cookie Preferences card with its "Manage" button. */
export const WithAnalyticsEnabled: Story = {
  decorators: [
    (StoryComponent) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{
          enableAnalytics: true,
          privacyPolicy: "https://example.com/privacy",
          termsAndConditions: "https://example.com/terms",
          accessibilityStatement: "https://example.com/accessibility",
          cookiePolicy: "https://example.com/cookies",
          impressum: "https://example.com/impressum",
        }}
      >
        <StoryComponent />
      </AppConfigProvider>
    ),
  ],
};

/** No legal documents configured — only Privacy Policy and Terms show, using the stirling.com fallback links. */
export const MinimalLinks: Story = {
  decorators: [
    (StoryComponent) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{ enableAnalytics: false }}
      >
        <StoryComponent />
      </AppConfigProvider>
    ),
  ],
};
