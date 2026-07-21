import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { PipelineBuilder } from "@portal/views/PipelineBuilder";

const meta: Meta<typeof PipelineBuilder> = {
  title: "Portal/Views/PipelineBuilder",
  component: PipelineBuilder,
  parameters: { layout: "fullscreen" },
  // The builder reads the tool registry (picker + per-step settings), so
  // stories supply the provider the app mounts in PortalApp.
  decorators: [
    (Story) => (
      <ToolRegistryProvider>
        <Story />
      </ToolRegistryProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PipelineBuilder>;

/**
 * New-pipeline mode against the seeded mock backend. The overview strip on top
 * renders the spec projection by default; its Flow segment switches to the
 * vertical flow projection of the same state.
 */
export const New: Story = {};
