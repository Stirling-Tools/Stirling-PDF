import type { Meta, StoryObj } from "@storybook/react-vite";
import { StepIndicator } from "@portal/components/getting-started/StepIndicator";
import "@portal/views/GettingStarted.css";

const STEPS = ["Pick a use case", "Analyze a document", "Go live"];

const meta: Meta<typeof StepIndicator> = {
  title: "Portal/GettingStarted/StepIndicator",
  component: StepIndicator,
  parameters: { layout: "padded" },
  args: { steps: STEPS, current: 0, onStepClick: () => {} },
};
export default meta;
type Story = StoryObj<typeof StepIndicator>;

export const FirstStep: Story = {};

export const MiddleStep: Story = { args: { current: 1 } };

/** Final step — the first two render as completed (clickable to revisit). */
export const LastStep: Story = { args: { current: 2 } };
