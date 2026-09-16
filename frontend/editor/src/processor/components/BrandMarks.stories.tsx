import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrandMark } from "@processor/components/BrandMarks";

const meta = {
  title: "Processor/BrandMarks",
  component: BrandMark,
  parameters: { layout: "padded" },
  args: {
    id: "s3",
    size: 24,
  },
} satisfies Meta<typeof BrandMark>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CloudProvider: Story = { args: { id: "googledrive" } };

export const Neutral: Story = { args: { id: "sftp" } };

export const UnknownFallback: Story = {
  args: { id: "some-unrecognised-source" },
};
