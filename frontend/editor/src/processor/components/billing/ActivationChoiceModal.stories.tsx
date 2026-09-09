import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActivationChoiceModal } from "@processor/components/billing/ActivationChoiceModal";
import "@processor/components/billing/billing.css";

const meta: Meta<typeof ActivationChoiceModal> = {
  title: "Processor/Billing/ActivationChoiceModal",
  component: ActivationChoiceModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onClose: () => {},
    onChoosePayg: () => {},
    onChoosePrepay: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof ActivationChoiceModal>;

/** The "turn on the Processor" fork — pay as you go vs prepay a year. */
export const Default: Story = {};
