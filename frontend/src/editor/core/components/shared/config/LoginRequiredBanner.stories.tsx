import type { Meta, StoryObj } from "@storybook/react-vite";
import LoginRequiredBanner from "@app/components/shared/config/LoginRequiredBanner";

const meta = {
  title: "Shared/Config/LoginRequiredBanner",
  component: LoginRequiredBanner,
  parameters: { layout: "padded" },
} satisfies Meta<typeof LoginRequiredBanner>;
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
