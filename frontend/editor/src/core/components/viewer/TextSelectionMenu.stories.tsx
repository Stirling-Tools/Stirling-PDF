import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SelectionSelectionMenuProps } from "@embedpdf/plugin-selection/react";
import { TextSelectionMenu } from "@app/components/viewer/TextSelectionMenu";

function baseProps(
  overrides: Partial<SelectionSelectionMenuProps> = {},
): SelectionSelectionMenuProps {
  return {
    rect: { origin: { x: 0, y: 0 }, size: { width: 120, height: 20 } },
    menuWrapperProps: { style: {}, ref: () => {} },
    selected: true,
    placement: { suggestTop: true },
    context: { type: "selection", pageIndex: 0 },
    ...overrides,
  };
}

const meta = {
  title: "Viewer/TextSelectionMenu",
  component: TextSelectionMenu,
  parameters: { layout: "centered" },
} satisfies Meta<typeof TextSelectionMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: baseProps(),
};

export const BelowSelection: Story = {
  args: baseProps({ placement: { suggestTop: false } }),
};

export const NotSelected: Story = {
  args: baseProps({ selected: false }),
};
