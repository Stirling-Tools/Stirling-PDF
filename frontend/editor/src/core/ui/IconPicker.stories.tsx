import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { IconPicker, type IconPickerOption } from "@app/ui/IconPicker";

const sx = { fontSize: "1.25rem" } as const;
const OPTIONS: IconPickerOption[] = [
  { key: "shield", label: "Shield", node: <ShieldOutlinedIcon sx={sx} /> },
  { key: "lock", label: "Lock", node: <LockOutlinedIcon sx={sx} /> },
  { key: "label", label: "Label", node: <LabelOutlinedIcon sx={sx} /> },
  { key: "layers", label: "Layers", node: <LayersOutlinedIcon sx={sx} /> },
  { key: "folder", label: "Folder", node: <FolderOutlinedIcon sx={sx} /> },
  { key: "bolt", label: "Bolt", node: <BoltOutlinedIcon sx={sx} /> },
  {
    key: "schedule",
    label: "Schedule",
    node: <ScheduleOutlinedIcon sx={sx} />,
  },
  {
    key: "sparkle",
    label: "Sparkle",
    node: <AutoAwesomeOutlinedIcon sx={sx} />,
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
