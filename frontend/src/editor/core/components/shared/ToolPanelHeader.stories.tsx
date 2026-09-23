import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "@app/ui/Icon";
import { ToolPanelHeader } from "@app/components/shared/ToolPanelHeader";

const meta: Meta<typeof ToolPanelHeader> = {
  title: "Shared/ToolPanelHeader",
  component: ToolPanelHeader,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: <Icon name="settings" size={18} />,
    title: "Split",
  },
};

/** Trailing close button only renders when `onClose` is supplied. */
export const WithCloseButton: Story = {
  args: {
    icon: <Icon name="settings" size={18} />,
    title: "Split",
    onClose: () => {},
    closeLabel: "Close tool panel",
  },
};
