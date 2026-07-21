import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";
import RightSidebar from "@app/components/tools/RightSidebar";

// RightSidebar reads from ToolWorkflowContext, SidebarContext, ToolRegistryProvider,
// and more, so it's simpler to mount the real provider tree than stub each one.
// Config bootstrap is non-blocking so the story doesn't wait on a network fetch.
const meta = {
  title: "Tools/RightSidebar",
  component: RightSidebar,
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
} satisfies Meta<typeof RightSidebar>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
