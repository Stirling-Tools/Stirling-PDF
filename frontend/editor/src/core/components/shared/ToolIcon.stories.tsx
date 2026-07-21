import type { Meta, StoryObj } from "@storybook/react-vite";
import { iconMap } from "@app/components/tools/automate/iconMap";
import { ToolIcon } from "@app/components/shared/ToolIcon";

const { PictureAsPdfIcon } = iconMap;

const meta = {
  title: "Shared/ToolIcon",
  component: ToolIcon,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ToolIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: <PictureAsPdfIcon />,
  },
};

/** Visually unavailable state, for tools the user can't run. */
export const ReducedOpacity: Story = {
  args: {
    icon: <PictureAsPdfIcon />,
    opacity: 0.25,
  },
};

/** No right margin, for inline placement. */
export const NoMargin: Story = {
  args: {
    icon: <PictureAsPdfIcon />,
    marginRight: "0",
  },
};
