import type { Meta, StoryObj } from "@storybook/react";
import { BrandSwitcher } from "@app/components/shared/BrandSwitcher";

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

/**
 * Both states together: the mark must sit at the same inline offset whether or
 * not the wordmark is present. Collapsed makes Button treat the trigger as
 * icon-only, which zeroes its padding - the switcher's compensating negative
 * margin has to go with it or the mark drifts left.
 */
export const ExpandedAndCollapsed: Story = {
  render: (args) => (
    <div style={{ display: "grid", gap: "0.5rem", width: "16rem" }}>
      <div data-testid="expanded">
        <BrandSwitcher {...args} collapsed={false} />
      </div>
      <div data-testid="collapsed">
        <BrandSwitcher {...args} collapsed />
      </div>
    </div>
  ),
};
