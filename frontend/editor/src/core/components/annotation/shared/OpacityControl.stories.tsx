import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { OpacityControl } from "@app/components/annotation/shared/OpacityControl";

const meta: Meta<typeof OpacityControl> = {
  title: "Annotation/OpacityControl",
  component: OpacityControl,
};
export default meta;
type Story = StoryObj<typeof OpacityControl>;

function OpacityControlDemo({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState(80);
  return (
    <OpacityControl value={value} onChange={setValue} disabled={disabled} />
  );
}

export const Default: Story = { render: () => <OpacityControlDemo /> };

export const Disabled: Story = {
  render: () => <OpacityControlDemo disabled />,
};
