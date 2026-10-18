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

// TextSelectionMenu reads the active document from ActiveDocumentContext, which
// defaults to `null` outside of a live EmbedPDF document-manager session (not something the
// shared preview can stub). With no active document it short-circuits and renders nothing,
// so this story only exercises that no-active-document mount path without throwing.
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
