import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WidthControl } from "@app/components/annotation/shared/WidthControl";

const meta: Meta<typeof WidthControl> = {
  title: "Annotation/WidthControl",
  component: WidthControl,
};
export default meta;
type Story = StoryObj<typeof WidthControl>;

function WidthControlDemo({
  min = 1,
  max = 12,
  disabled,
}: {
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(Math.round((min + max) / 2));
  return (
    <WidthControl
      value={value}
      onChange={setValue}
      min={min}
      max={max}
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <WidthControlDemo /> };

export const Disabled: Story = { render: () => <WidthControlDemo disabled /> };
