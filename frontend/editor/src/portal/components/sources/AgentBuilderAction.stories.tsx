import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentBuilderAction } from "@portal/components/sources/AgentBuilderAction";

const meta = {
  title: "Portal/Sources/AgentBuilderAction",
  component: AgentBuilderAction,
} satisfies Meta<typeof AgentBuilderAction>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
