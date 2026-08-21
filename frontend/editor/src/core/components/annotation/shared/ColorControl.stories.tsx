import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ColorControl } from "@app/components/annotation/shared/ColorControl";

const meta: Meta<typeof ColorControl> = {
  title: "Annotation/ColorControl",
  component: ColorControl,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ColorControl>;

function ColorControlDemo({
  initialColor = "#ff0000",
  disabled,
}: {
  initialColor?: string;
  disabled?: boolean;
}) {
  const [color, setColor] = useState(initialColor);
  return (
    <ColorControl
      label="Colour"
      value={color}
      onChange={setColor}
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <ColorControlDemo /> };

export const Disabled: Story = {
  render: () => <ColorControlDemo disabled />,
};
