import type { Meta, StoryObj } from "@storybook/react-vite";
import { PrivateContent } from "@app/components/shared/PrivateContent";

/** Layout-invisible wrapper that tags sensitive content with 'ph-no-capture' to exclude it from analytics. */
const meta: Meta<typeof PrivateContent> = {
  title: "Shared/PrivateContent",
  component: PrivateContent,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "sensitive-filename.pdf",
  },
};

export const WithCustomClassName: Story = {
  args: {
    children: "sensitive-filename.pdf",
    className: "custom-class",
  },
};
