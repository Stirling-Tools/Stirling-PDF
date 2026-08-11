import type { Meta, StoryObj } from "@storybook/react-vite";
import { PrepayModalHeader } from "@processor/components/billing/PrepayModalHeader";
import "@processor/components/billing/billing.css";

const meta: Meta<typeof PrepayModalHeader> = {
  title: "Processor/Billing/PrepayModalHeader",
  component: PrepayModalHeader,
  args: {
    step: 1,
    total: 3,
    title: "Choose an amount",
    onClose: () => console.log("close"),
  },
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof PrepayModalHeader>;

/** Prepaid wizard, step 1 of 3 — badge + 3-segment progress bar. */
export const StepOfThree: Story = {};

/** Metered checkout, step 2 of 2 — badge + 2-segment progress bar. */
export const StepOfTwo: Story = {
  args: { step: 2, total: 2, title: "Add a payment method" },
};

/** No step supplied — badge and progress bar are hidden (e.g. a terminal confirmation screen). */
export const NoSteps: Story = {
  args: { step: undefined, title: "You're all set" },
};
