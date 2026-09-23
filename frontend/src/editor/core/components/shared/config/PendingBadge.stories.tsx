import type { Meta, StoryObj } from "@storybook/react-vite";
import PendingBadge from "@app/components/shared/config/PendingBadge";

const meta = {
  title: "Shared/Config/PendingBadge",
  component: PendingBadge,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PendingBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    show: true,
  },
};

export const Hidden: Story = {
  args: {
    show: false,
  },
};

export const LargeSize: Story = {
  args: {
    show: true,
    size: "lg",
  },
};
