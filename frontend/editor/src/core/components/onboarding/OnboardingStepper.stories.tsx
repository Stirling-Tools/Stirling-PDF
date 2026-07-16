import type { Meta, StoryObj } from "@storybook/react-vite";
import { OnboardingStepper } from "@app/components/onboarding/OnboardingStepper";

const meta = {
  title: "Onboarding/OnboardingStepper",
  component: OnboardingStepper,
  args: { totalSteps: 5, activeStep: 2 },
  argTypes: {
    totalSteps: { control: { type: "number", min: 1, max: 10 } },
    activeStep: { control: { type: "number", min: 0, max: 9 } },
  },
} satisfies Meta<typeof OnboardingStepper>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { totalSteps: 5, activeStep: 2 } };

export const FirstStep: Story = { args: { totalSteps: 5, activeStep: 0 } };

export const LastStep: Story = { args: { totalSteps: 5, activeStep: 4 } };
