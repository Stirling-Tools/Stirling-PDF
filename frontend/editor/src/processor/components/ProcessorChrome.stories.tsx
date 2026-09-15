import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProcessorChrome } from "@processor/components/ProcessorChrome";

const meta = {
  title: "Processor/Shell/ProcessorChrome",
  component: ProcessorChrome,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ProcessorChrome>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
