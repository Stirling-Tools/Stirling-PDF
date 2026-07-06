import type { Meta, StoryObj } from "@storybook/react-vite";
import { StageStepper } from "@portal/components/procurement/StageStepper";
import { JOURNEY } from "@portal/mocks/procurement";
import "@portal/views/Procurement.css";

const meta: Meta<typeof StageStepper> = {
  title: "Portal/Procurement/StageStepper",
  component: StageStepper,
  parameters: { layout: "padded" },
  args: { journey: JOURNEY },
};
export default meta;
type Story = StoryObj<typeof StageStepper>;

export const AtAgreement: Story = { args: { currentStage: "security" } };

export const AtTrial: Story = { args: { currentStage: "trial" } };

// Greyed preview for the free/pro upgrade gate, no stage is current.
export const Locked: Story = { args: { currentStage: "trial", locked: true } };
