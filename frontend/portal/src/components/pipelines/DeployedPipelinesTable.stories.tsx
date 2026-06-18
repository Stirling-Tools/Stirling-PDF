import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeployedPipelinesTable } from "@portal/components/pipelines/DeployedPipelinesTable";
import {
  DEGRADED_PIPELINE,
  HEALTHY_PIPELINE,
} from "@portal/components/pipelines/storyFixtures";
import "@portal/views/Pipelines.css";

const meta: Meta<typeof DeployedPipelinesTable> = {
  title: "Portal/Pipelines/DeployedPipelinesTable",
  component: DeployedPipelinesTable,
  parameters: { layout: "padded" },
  args: { onRowClick: () => {} },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "72rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DeployedPipelinesTable>;

/** A healthy pipeline at bound and one degraded below its golden-set bound. */
export const Default: Story = {
  args: { pipelines: [HEALTHY_PIPELINE, DEGRADED_PIPELINE] },
};

export const Empty: Story = {
  args: { pipelines: [] },
};
