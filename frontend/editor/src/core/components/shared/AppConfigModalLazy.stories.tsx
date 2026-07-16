import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import AppConfigModalLazy from "@app/components/shared/AppConfigModalLazy";
import { AppProviders } from "@app/components/AppProviders";

// AppConfigModal (lazy-loaded once opened) reads from AppConfigContext, the
// tool registry, navigation, and the rest of the providers only available
// inside the full app tree — mount that here with the network fetch + blocking
// gate disabled so the story renders immediately. urlSync is off so the modal
// doesn't try to sync its section against the real /settings route.
function AppConfigModalLazyDemo({ opened }: { opened: boolean }) {
  return (
    <AppProviders
      appConfigProviderProps={{
        initialConfig: {},
        bootstrapMode: "non-blocking",
        autoFetch: false,
      }}
    >
      <AppConfigModalLazy
        opened={opened}
        onClose={fn()}
        urlSync={false}
        initialSection="general"
      />
    </AppProviders>
  );
}

const meta = {
  title: "Shared/AppConfigModalLazy",
  component: AppConfigModalLazy,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppConfigModalLazy>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  render: () => <AppConfigModalLazyDemo opened={false} />,
};

export const Opened: Story = {
  render: () => <AppConfigModalLazyDemo opened />,
};
