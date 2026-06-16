import type { Meta, StoryObj } from "@storybook/react-vite";
import { PipelineListSkeleton } from "@portal/components/pipelines/PipelineListSkeleton";

const meta: Meta<typeof PipelineListSkeleton> = {
  title: "Portal/Pipelines/PipelineListSkeleton",
  component: PipelineListSkeleton,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "52rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PipelineListSkeleton>;

export const Default: Story = {};
