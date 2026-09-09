import { useState } from "react";
import { Icon } from "@app/ui/Icon";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconPicker, type IconPickerOption } from "@app/ui/IconPicker";

const OPTIONS: IconPickerOption[] = [
  {
    key: "shield",
    label: "Shield",
    node: <Icon name="shield" size="1.25rem" />,
  },
  { key: "lock", label: "Lock", node: <Icon name="lock" size="1.25rem" /> },
  { key: "label", label: "Label", node: <Icon name="tag" size="1.25rem" /> },
  {
    key: "layers",
    label: "Layers",
    node: <Icon name="layers" size="1.25rem" />,
  },
  {
    key: "folder",
    label: "Folder",
    node: <Icon name="folder" size="1.25rem" />,
  },
  { key: "bolt", label: "Bolt", node: <Icon name="zap" size="1.25rem" /> },
  {
    key: "schedule",
    label: "Schedule",
    node: <Icon name="clock" size="1.25rem" />,
  },
  {
    key: "sparkle",
    label: "Sparkle",
    node: <Icon name="sparkles" size="1.25rem" />,
  },
];

const meta: Meta<typeof IconPicker> = {
  title: "Primitives/IconPicker",
  component: IconPicker,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof IconPicker>;

/** Click the glyph to open the grid and choose a new icon from the supplied set. */
export const Default: Story = {
  render: () => {
    const [value, setValue] = useState("shield");
    return (
      <IconPicker
        value={value}
        onChange={setValue}
        options={OPTIONS}
        ariaLabel="Icon"
      />
    );
  },
};
