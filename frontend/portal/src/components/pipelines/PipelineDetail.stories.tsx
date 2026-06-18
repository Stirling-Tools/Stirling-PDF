import type { Meta, StoryObj } from "@storybook/react-vite";
import { PipelineDetail } from "@portal/components/pipelines/PipelineDetail";
import {
  DEGRADED_PIPELINE,
  HEALTHY_PIPELINE,
} from "@portal/components/pipelines/storyFixtures";

const meta: Meta<typeof PipelineDetail> = {
  title: "Portal/Pipelines/PipelineDetail",
  component: PipelineDetail,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "32rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PipelineDetail>;

/** Clean golden set, no drift. */
export const Healthy: Story = {
  args: { pipeline: HEALTHY_PIPELINE },
};

/** Failing golden cases plus warning- and info-severity schema drift. */
export const DegradedWithDrift: Story = {
  args: { pipeline: DEGRADED_PIPELINE },
};
