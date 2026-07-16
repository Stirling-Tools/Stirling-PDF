import type { Meta, StoryObj } from "@storybook/react-vite";
import AppConfigModal from "@app/components/shared/AppConfigModal";
import { AppProviders } from "@app/components/AppProviders";

// AppConfigModal renders section components (GeneralSection, HotkeysSection,
// etc.) that reach into PreferencesContext, the core ThemeProvider and
// AppConfigContext — the same provider tree AppProviders sets up around the
// real app (mirrors Workbench.stories.tsx).
const meta = {
  title: "Shared/AppConfigModal",
  component: AppConfigModal,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <AppProviders
        appConfigProviderProps={{
          initialConfig: {},
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <Story />
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof AppConfigModal>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Opened on the default "General" section, with URL syncing off so it doesn't
 *  try to navigate the story's router. */
export const Default: Story = {
  args: {
    opened: true,
    onClose: () => {},
    urlSync: false,
  },
};

/** Deep-linked straight to a specific section via `initialSection`. */
export const HotkeysSection: Story = {
  args: {
    opened: true,
    onClose: () => {},
    urlSync: false,
    initialSection: "hotkeys",
  },
};
