import type { Meta, StoryObj } from "@storybook/react-vite";
import { S3ConnectionPicker } from "@portal/components/sources/S3ConnectionPicker";

const meta = {
  title: "Portal/Sources/S3ConnectionPicker",
  component: S3ConnectionPicker,
  parameters: { layout: "padded" },
  args: {
    value: "",
    onChange: () => {},
  },
} satisfies Meta<typeof S3ConnectionPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { value: "1" } };
