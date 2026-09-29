import type { Meta, StoryObj } from "@storybook/react-vite";
import NumberInputWithUnit from "@app/components/tools/shared/NumberInputWithUnit";

const meta = {
  title: "Tools/Shared/NumberInputWithUnit",
  component: NumberInputWithUnit,
} satisfies Meta<typeof NumberInputWithUnit>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Margin",
    value: 10,
    onChange: () => {},
    unit: "px",
  },
};

export const WithMinMax: Story = {
  args: {
    ...Default.args,
    label: "Opacity",
    value: 50,
    unit: "%",
    min: 0,
    max: 100,
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true,
  },
};
