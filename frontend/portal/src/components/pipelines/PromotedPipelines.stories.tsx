import type { Meta, StoryObj } from "@storybook/react-vite";
import { PromotedPipelines } from "@portal/components/pipelines/PromotedPipelines";
import { PROMOTED_PIPELINES } from "@portal/components/pipelines/storyFixtures";
import "@portal/views/Pipelines.css";

const meta: Meta<typeof PromotedPipelines> = {
  title: "Portal/Pipelines/PromotedPipelines",
  component: PromotedPipelines,
  parameters: { layout: "padded" },
  args: { promoted: PROMOTED_PIPELINES },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "72rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PromotedPipelines>;

export const Default: Story = {};

export const Empty: Story = {
  args: { promoted: [] },
};
