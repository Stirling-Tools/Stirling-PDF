import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "@editor/ui/Icon";
import { ToolPanelHeader } from "@editor/components/shared/ToolPanelHeader";
import { EditorHeaderHelp } from "@editor/tools/pdfTextEditor/components/EditorHeaderHelp";

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

/** The active tool can add its own control beside the title, here the text editor's shortcuts help. */
export const WithToolAction: Story = {
  args: {
    icon: <Icon name="settings" size={18} />,
    title: "Edit text",
  },
  render: (args) => (
    <>
      <ToolPanelHeader {...args} />
      <EditorHeaderHelp onShowHelp={() => {}} />
    </>
  ),
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
