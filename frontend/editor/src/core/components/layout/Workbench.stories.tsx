import type { Meta, StoryObj } from "@storybook/react-vite";
import Workbench from "@app/components/layout/Workbench";
import { AppProviders } from "@app/components/AppProviders";

// Workbench takes no props at all - every bit of state (active files, current
// view, tool selection, signing overlay, config) comes from contexts, which
// only resolve inside the same provider tree the app wraps around it (mirrors
// FileManagerView.stories.tsx).
const meta = {
  title: "Layout/Workbench",
  component: Workbench,
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
} satisfies Meta<typeof Workbench>;
export default meta;

type Story = StoryObj<typeof meta>;

/** No files loaded yet - renders the landing page inside the workbench. */
export const Default: Story = {};
