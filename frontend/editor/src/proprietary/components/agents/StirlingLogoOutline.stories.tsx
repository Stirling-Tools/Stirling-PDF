import type { Meta, StoryObj } from "@storybook/react-vite";
import { StirlingLogoOutline } from "@app/components/agents/StirlingLogoOutline";

const meta = {
  title: "Agents/StirlingLogoOutline",
  component: StirlingLogoOutline,
  parameters: { layout: "centered" },
  args: {
    size: 20,
  },
} satisfies Meta<typeof StirlingLogoOutline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Large: Story = {
  args: {
    size: 64,
  },
};
