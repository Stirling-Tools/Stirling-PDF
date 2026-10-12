import type { Meta, StoryObj } from "@storybook/react-vite";
import { StirlingLogoAnimated } from "@app/components/agents/StirlingLogoAnimated";

/**
 * Animated Stirling logo mark, used as a "thinking" indicator in the chat panel.
 */
const meta: Meta<typeof StirlingLogoAnimated> = {
  title: "Agents/StirlingLogoAnimated",
  component: StirlingLogoAnimated,
  parameters: { layout: "padded" },
  args: {
    size: 20,
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Large: Story = {
  args: { size: 64 },
};
