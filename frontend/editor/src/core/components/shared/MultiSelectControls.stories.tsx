import type { Meta, StoryObj } from "@storybook/react-vite";
import MultiSelectControls from "@app/components/shared/MultiSelectControls";

const meta: Meta<typeof MultiSelectControls> = {
  title: "Shared/MultiSelectControls",
  component: MultiSelectControls,
  parameters: { layout: "padded" },
  args: {
    selectedCount: 3,
    onClearSelection: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Only the always-present "Clear files" action, since none of the optional handlers are passed. */
export const Default: Story = {};

/** All optional actions supplied — every button in the group renders. */
export const AllActions: Story = {
  args: {
    onAddToUpload: () => {},
    onOpenInFileEditor: () => {},
    onOpenInPageEditor: () => {},
    onDeleteAll: () => {},
  },
};

/** Renders nothing when no files are selected. */
export const NoSelection: Story = {
  args: {
    selectedCount: 0,
  },
};
