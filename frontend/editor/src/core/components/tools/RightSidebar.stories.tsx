import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";
import RightSidebar from "@app/components/tools/RightSidebar";

// RightSidebar reads from ToolWorkflowContext, SidebarContext, ToolRegistryProvider
// and more — mount the real provider tree rather than stubbing each one
// individually. Config bootstrap is non-blocking so the story doesn't wait on a
// network fetch (matches AppProviders.stories.tsx).
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
