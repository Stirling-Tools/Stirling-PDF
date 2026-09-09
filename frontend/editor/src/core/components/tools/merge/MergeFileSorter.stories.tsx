import type { Meta, StoryObj } from "@storybook/react-vite";
import MergeFileSorter from "@app/components/tools/merge/MergeFileSorter";

const meta = {
  title: "Tools/Merge/MergeFileSorter",
  component: MergeFileSorter,
} satisfies Meta<typeof MergeFileSorter>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onSortFiles: () => {},
  },
};

export const Disabled: Story = {
  args: {
    onSortFiles: () => {},
    disabled: true,
  },
};
