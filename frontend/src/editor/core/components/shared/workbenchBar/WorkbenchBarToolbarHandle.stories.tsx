import type { Meta, StoryObj } from "@storybook/react-vite";
import WorkbenchBarToolbarHandle from "@editor/components/shared/workbenchBar/WorkbenchBarToolbarHandle";

const meta = {
  title: "Shared/WorkbenchBar/WorkbenchBarToolbarHandle",
  component: WorkbenchBarToolbarHandle,
  args: { isMobile: true, expanded: false, onToggleExpanded: () => {} },
} satisfies Meta<typeof WorkbenchBarToolbarHandle>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The tool row is one scrolling line; the handle offers every tool. */
export const Collapsed: Story = {};

export const Expanded: Story = { args: { expanded: true } };
