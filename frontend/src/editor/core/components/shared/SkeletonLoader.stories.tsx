import type { Meta, StoryObj } from "@storybook/react-vite";
import SkeletonLoader from "@app/components/shared/SkeletonLoader";

const meta: Meta<typeof SkeletonLoader> = {
  title: "Shared/SkeletonLoader",
  component: SkeletonLoader,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const PageGrid: Story = {
  args: { type: "pageGrid", count: 4 },
};

export const FileGrid: Story = {
  args: { type: "fileGrid", count: 4 },
};

export const Controls: Story = {
  args: { type: "controls" },
};

export const Viewer: Story = {
  args: { type: "viewer" },
  decorators: [
    (S) => (
      <div style={{ height: "20rem" }}>
        <S />
      </div>
    ),
  ],
};

export const Block: Story = {
  args: { type: "block", width: 120, height: 20 },
};
