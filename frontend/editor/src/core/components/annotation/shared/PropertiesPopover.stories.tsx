import type { Meta, StoryObj } from "@storybook/react-vite";
import { PropertiesPopover } from "@app/components/annotation/shared/PropertiesPopover";

const meta = {
  title: "Annotation/Shared/PropertiesPopover",
  component: PropertiesPopover,
  parameters: { layout: "centered" },
} satisfies Meta<typeof PropertiesPopover>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {
  args: {
    annotationType: "text",
    annotation: undefined,
    onUpdate: () => {},
  },
};

export const Shape: Story = {
  args: {
    annotationType: "shape",
    annotation: undefined,
    onUpdate: () => {},
  },
};

export const Disabled: Story = {
  args: {
    annotationType: "text",
    annotation: undefined,
    onUpdate: () => {},
    disabled: true,
  },
};
