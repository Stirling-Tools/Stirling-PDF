import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChipFlow } from "@shared/components/ChipFlow";

const meta: Meta<typeof ChipFlow> = {
  title: "Primitives/ChipFlow",
  component: ChipFlow,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    items: ["Classify", "Extract", "Name", "Normalize"],
    separator: "arrow",
    tone: "neutral",
    size: "sm",
  },
  argTypes: {
    separator: { control: "inline-radio", options: ["arrow", "none"] },
  },
};
export default meta;
type Story = StoryObj<typeof ChipFlow>;

export const Pipeline: Story = { args: { separator: "arrow" } };
export const Plain: Story = {
  args: { separator: "none", items: ["HIPAA", "GDPR", "SOC 2"] },
};
