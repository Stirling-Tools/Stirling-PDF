import type { Meta, StoryObj } from "@storybook/react-vite";
import { PrivateContent } from "@editor/components/shared/PrivateContent";

/** Layout-invisible wrapper that keeps sensitive content out of analytics. Clicks on it are still sent as events, without its text. */
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
