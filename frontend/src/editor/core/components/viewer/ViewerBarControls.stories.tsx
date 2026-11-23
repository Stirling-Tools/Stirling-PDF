import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Menu } from "@mantine/core";
import { userEvent, within } from "storybook/test";
import {
  BarButton,
  BarMenu,
  toggleProps,
  SelectedNote,
} from "@editor/components/viewer/ViewerBarControls";

/** The tool row's size container; its labels drop to icons at 820px or less. */
function ToolRow({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div
      style={{
        containerType: "inline-size",
        containerName: "workbench-tool-row",
        width,
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Viewer/ViewerBarControls",
  component: BarButton,
  args: { icon: "square-pen", label: "Edit Text" },
} satisfies Meta<typeof BarButton>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Labelled: Story = {};

export const Active: Story = { args: { active: true } };

export const Disabled: Story = { args: { disabled: true } };

/** Named by its tooltip rather than a label. */
export const IconOnly: Story = {
  args: { icon: "bookmark", label: "Bookmarks", iconOnly: true },
};

const modes = (
  <>
    <BarButton icon="square-pen" label="Edit Text" />
    <BarButton icon="pencil" label="Annotate" active />
    <BarButton icon="file-x" label="Redact" />
    <BarButton icon="clipboard-pen-line" label="Form Editor" />
  </>
);

export const WideRow: Story = {
  render: () => <ToolRow width={900}>{modes}</ToolRow>,
};

/** Too narrow for the words: each button keeps its icon and gains a tooltip. */
export const NarrowRow: Story = {
  render: () => <ToolRow width={600}>{modes}</ToolRow>,
};

/** A labelled control opening related settings; it stays open as they change. */
export const Menu_: Story = {
  name: "Menu",
  render: () => (
    <div style={{ minHeight: "12rem" }}>
      <BarMenu icon="columns-2" label="View">
        <SelectedNote id="story-selected" />
        <Menu.Label>Layout</Menu.Label>
        <Menu.Item {...toggleProps(true, "story-selected")}>
          Single page
        </Menu.Item>
        <Menu.Item {...toggleProps(false, "story-selected")}>
          Dual page
        </Menu.Item>
      </BarMenu>
    </div>
  ),
  parameters: {
    // Mantine puts a focus placeholder div inside every open menu.
    a11y: {
      config: { rules: [{ id: "aria-required-children", enabled: false }] },
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
  },
};
