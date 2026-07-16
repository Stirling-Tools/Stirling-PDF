import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssistantMount } from "@portal/components/AssistantMount";

const meta = {
  title: "Portal/Assistant/AssistantMount",
  component: AssistantMount,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AssistantMount>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
