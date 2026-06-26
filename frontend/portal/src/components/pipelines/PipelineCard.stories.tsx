import type { Meta, StoryObj } from "@storybook/react-vite";
import { PipelineCard } from "@portal/components/pipelines/PipelineCard";
import {
  DEGRADED_PIPELINE,
  HEALTHY_PIPELINE,
} from "@portal/components/pipelines/storyFixtures";

const meta: Meta<typeof PipelineCard> = {
  title: "Portal/Pipelines/PipelineCard",
  component: PipelineCard,
  parameters: { layout: "padded" },
  args: { onOpen: () => console.log("open") },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "52rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PipelineCard>;

export const Healthy: Story = {
  args: { pipeline: HEALTHY_PIPELINE },
};

export const DegradedWithDrift: Story = {
  args: { pipeline: DEGRADED_PIPELINE },
};
