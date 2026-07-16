import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToolPickerFooterExtensions } from "@app/components/tools/toolPicker/ToolPickerFooterExtensions";

/** Core-flavor stub: renders nothing (desktop-only sign-in prompt for local mode). */
const meta: Meta<typeof ToolPickerFooterExtensions> = {
  title: "Tools/ToolPicker/ToolPickerFooterExtensions",
  component: ToolPickerFooterExtensions,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
