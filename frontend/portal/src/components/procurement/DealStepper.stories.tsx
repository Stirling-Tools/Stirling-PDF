import type { Meta, StoryObj } from "@storybook/react-vite";
import { DealStepper } from "@portal/components/procurement/DealStepper";
import { JOURNEY } from "@portal/mocks/procurement";
import "@portal/views/Procurement.css";

const meta: Meta<typeof DealStepper> = {
  title: "Portal/Procurement/DealStepper",
  component: DealStepper,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof DealStepper>;

// Mid-journey: trial + quote complete, agreement is the current gating step.
export const AtAgreement: Story = {
  args: { journey: JOURNEY, currentStage: "security" },
};

// First step — the trial, gating action is "Build your quote".
export const AtTrial: Story = {
  args: { journey: JOURNEY, currentStage: "trial" },
};

// Terminal stage shows provisioning rather than a CTA.
export const Active: Story = {
  args: { journey: JOURNEY, currentStage: "active" },
};

// Greyed preview shown to free/pro behind the upgrade prompt.
export const Locked: Story = {
  args: { journey: JOURNEY, currentStage: "trial", locked: true },
};
