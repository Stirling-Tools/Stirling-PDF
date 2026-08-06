import type { Meta, StoryObj } from "@storybook/react";
import { BrandSwitcher } from "@editor/components/shared/BrandSwitcher";

const meta: Meta<typeof BrandSwitcher> = {
  title: "Brand/BrandSwitcher",
  component: BrandSwitcher,
  parameters: { layout: "centered" },
  args: { current: "processor", onSwitch: () => {} },
  argTypes: {
    current: { control: "inline-radio", options: ["editor", "processor"] },
  },
};
export default meta;
type Story = StoryObj<typeof BrandSwitcher>;

export const Playground: Story = {};
