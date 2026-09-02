import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectBenefitsSlide } from "@processor/components/account-link/connect/ConnectBenefitsSlide";

const meta: Meta<typeof ConnectBenefitsSlide> = {
  title: "Processor/AccountLink/Connect/BenefitsSlide",
  component: ConnectBenefitsSlide,
};
export default meta;
type Story = StoryObj<typeof ConnectBenefitsSlide>;

/** Step 1 of the Connect flow: the case for linking. */
export const Default: Story = {};
