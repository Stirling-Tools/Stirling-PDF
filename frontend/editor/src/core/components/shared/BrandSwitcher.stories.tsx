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

/** Both states: the mark must hold its inline offset with or without the wordmark. */
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
