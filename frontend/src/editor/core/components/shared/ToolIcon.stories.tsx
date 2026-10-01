import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "@app/ui/Icon";
import { ToolIcon } from "@app/components/shared/ToolIcon";

const meta = {
  title: "Shared/ToolIcon",
  component: ToolIcon,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ToolIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: <Icon name="file-pdf" />,
  },
};

/** Visually unavailable state, for tools the user can't run. */
export const ReducedOpacity: Story = {
  args: {
    icon: <Icon name="file-pdf" />,
    opacity: 0.25,
  },
};

/** No right margin, for inline placement. */
export const NoMargin: Story = {
  args: {
    icon: <Icon name="file-pdf" />,
    marginRight: "0",
  },
};
