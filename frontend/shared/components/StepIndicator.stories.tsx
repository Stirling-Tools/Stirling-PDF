import type { Meta, StoryObj } from "@storybook/react-vite";
import { StepIndicator } from "@shared/components/StepIndicator";

const meta: Meta<typeof StepIndicator> = {
  title: "Primitives/StepIndicator",
  component: StepIndicator,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { total: 3, current: 2, size: "md" },
  argTypes: {
    current: { control: { type: "number", min: 1, max: 5 } },
    total: { control: { type: "number", min: 1, max: 5 } },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "20rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof StepIndicator>;

export const Step1: Story = { args: { total: 3, current: 1 } };
export const Step2: Story = { args: { total: 3, current: 2 } };
export const Step3: Story = { args: { total: 3, current: 3 } };
export const Small: Story = { args: { total: 4, current: 2, size: "sm" } };
