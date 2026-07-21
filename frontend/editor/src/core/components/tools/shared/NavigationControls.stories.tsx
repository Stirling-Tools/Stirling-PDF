import type { Meta, StoryObj } from "@storybook/react-vite";
import NavigationControls from "@app/components/tools/shared/NavigationControls";

const meta = {
  title: "ToolsShared/NavigationControls",
  component: NavigationControls,
} satisfies Meta<typeof NavigationControls>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    currentIndex: 0,
    totalFiles: 5,
    onPrevious: () => {},
    onNext: () => {},
  },
};

export const LastFile: Story = {
  args: {
    currentIndex: 4,
    totalFiles: 5,
    onPrevious: () => {},
    onNext: () => {},
  },
};

export const SingleFile: Story = {
  args: {
    currentIndex: 0,
    totalFiles: 1,
    onPrevious: () => {},
    onNext: () => {},
  },
};
