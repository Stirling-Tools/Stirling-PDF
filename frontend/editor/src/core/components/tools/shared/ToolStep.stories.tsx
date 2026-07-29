import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "@mantine/core";
import ToolStep from "@app/components/tools/shared/ToolStep";

const meta = {
  title: "Tools/Shared/ToolStep",
  component: ToolStep,
} satisfies Meta<typeof ToolStep>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Select pages",
    children: <Text size="sm">Step content goes here.</Text>,
  },
};

export const WithHelpTextAndNumber: Story = {
  args: {
    title: "Choose output format",
    helpText: "Pick the format your converted file should use.",
    showNumber: true,
    _stepNumber: 2,
    children: <Text size="sm">Step content goes here.</Text>,
  },
};

export const Collapsed: Story = {
  args: {
    title: "Advanced settings",
    isCollapsed: true,
    onCollapsedClick: () => {},
    children: <Text size="sm">Step content goes here.</Text>,
  },
};
