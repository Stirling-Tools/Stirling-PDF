import type { Meta, StoryObj } from "@storybook/react-vite";
import AppConfigLoader from "@app/components/shared/AppConfigLoader";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";

/**
 * Renders nothing — it mounts high in the tree and applies server-provided
 * language config (supported languages + default locale) as a side effect.
 */
const meta = {
  title: "Shared/AppConfigLoader",
  component: AppConfigLoader,
} satisfies Meta<typeof AppConfigLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No config resolved yet (default context state) — effect is a no-op. */
export const Default: Story = {};

/** Config already resolved with a restricted language list — exercises the language-filtering effect. */
export const WithResolvedConfig: Story = {
  decorators: [
    (StoryComponent) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{
          languages: ["en-US", "fr-FR"],
          defaultLocale: "en-US",
        }}
      >
        <StoryComponent />
      </AppConfigProvider>
    ),
  ],
};
