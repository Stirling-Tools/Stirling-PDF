import type { Meta, StoryObj } from "@storybook/react-vite";
import { PipelineComposer } from "@portal/components/pipelines/PipelineComposer";

const meta: Meta<typeof PipelineComposer> = {
  title: "Portal/Pipelines/PipelineComposer",
  component: PipelineComposer,
  parameters: { layout: "fullscreen" },
  args: { open: true, onClose: () => console.log("close") },
  decorators: [
    (S) => (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PipelineComposer>;

/** Opens on the source step; step through Operations and Routing in the footer. */
export const Open: Story = {};

export const Closed: Story = {
  args: { open: false },
};
