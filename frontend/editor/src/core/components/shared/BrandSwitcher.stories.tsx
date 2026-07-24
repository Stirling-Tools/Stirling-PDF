import type { Meta, StoryObj } from "@storybook/react";
import { BrandSwitcher } from "@app/components/shared/BrandSwitcher";

const meta: Meta<typeof BrandSwitcher> = {
  title: "Brand/BrandSwitcher",
  component: BrandSwitcher,
  parameters: { layout: "centered" },
  args: { current: "processor", theme: "light", onSwitch: () => {} },
  argTypes: {
    current: { control: "inline-radio", options: ["editor", "processor"] },
    theme: { control: "inline-radio", options: ["light", "dark"] },
  },
};
export default meta;
type Story = StoryObj<typeof BrandSwitcher>;

export const Playground: Story = {};
