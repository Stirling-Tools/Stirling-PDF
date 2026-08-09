/**
 * What the tool picker shows when a search matches nothing. A single line, no
 * props — the whole component is its message.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import NoToolsFound from "@app/components/tools/shared/NoToolsFound";

const meta: Meta<typeof NoToolsFound> = {
  title: "Tools/Shared/NoToolsFound",
  component: NoToolsFound,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof NoToolsFound>;

export const Default: Story = {};

/** In the narrow rail the picker actually occupies. */
export const InRail: Story = {
  render: () => (
    <div style={{ width: 240, border: "1px solid var(--c-border)" }}>
      <NoToolsFound />
    </div>
  ),
};
