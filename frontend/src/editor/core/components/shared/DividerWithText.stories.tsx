import type { Meta, StoryObj } from "@storybook/react-vite";
import DividerWithText from "@app/components/shared/DividerWithText";

/**
 * Horizontal rule, optionally with a centered text label (e.g. "or").
 */
const meta = {
  title: "Shared/DividerWithText",
  component: DividerWithText,
  parameters: { layout: "padded" },
  args: {
    text: "or",
  },
} satisfies Meta<typeof DividerWithText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** With no `text`, renders a plain horizontal rule. */
export const PlainRule: Story = {
  args: { text: undefined },
};

export const Subcategory: Story = {
  args: {
    text: "Advanced options",
    variant: "subcategory",
  },
};
