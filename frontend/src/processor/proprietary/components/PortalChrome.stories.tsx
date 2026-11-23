import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToolRegistryProvider } from "@editor/contexts/ToolRegistryProvider";
import { PortalChrome } from "@processor/components/PortalChrome";

const meta = {
  title: "Portal/Shell/PortalChrome",
  component: PortalChrome,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <ToolRegistryProvider>
        <Story />
      </ToolRegistryProvider>
    ),
  ],
} satisfies Meta<typeof PortalChrome>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
