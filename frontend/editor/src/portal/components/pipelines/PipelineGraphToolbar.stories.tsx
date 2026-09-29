import type { Meta, StoryObj } from "@storybook/react-vite";
import { PipelineGraphToolbar } from "@portal/components/pipelines/PipelineGraphToolbar";

const meta: Meta<typeof PipelineGraphToolbar> = {
  title: "Portal/Pipelines/PipelineGraphToolbar",
  component: PipelineGraphToolbar,
  parameters: { layout: "padded" },
  args: {
    stepCount: 2,
    testing: false,
    runResult: null,
    onTest: () => {},
    onDownloadOutput: () => {},
    onViewDefinition: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof PipelineGraphToolbar>;

/** Idle: just the test control. */
export const Idle: Story = {};

/** A chain with no steps cannot be tested. */
export const NoSteps: Story = { args: { stepCount: 0 } };

/** Mid test-run. */
export const Testing: Story = { args: { testing: true } };

/** After a completed run: the outcome and its files sit beside the button. */
export const Completed: Story = {
  args: {
    runResult: {
      status: "completed",
      completedSteps: 3,
      stepCount: 3,
      outputs: [
        { fileId: "f1", fileName: "claim-redacted.pdf" },
        { fileId: "f2", fileName: null },
      ],
    },
  },
};

/** A failed run: the summary and the failure reason. */
export const Failed: Story = {
  args: {
    runResult: {
      status: "failed",
      completedSteps: 1,
      stepCount: 3,
      error: "OCR failed: unreadable page",
    },
  },
};
