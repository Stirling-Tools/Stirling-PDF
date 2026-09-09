import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import SliderWithInput from "@app/components/shared/sliderWithInput/SliderWithInput";

/** Reproduces the compression "Quality" slider used in tool settings panels. */
const meta: Meta<typeof SliderWithInput> = {
  title: "Shared/SliderWithInput",
  component: SliderWithInput,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "22rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SliderWithInput>;

function SliderDemo({
  disabled,
  initial = 60,
}: {
  disabled?: boolean;
  initial?: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SliderWithInput
      label="Quality"
      value={value}
      onChange={setValue}
      disabled={disabled}
      min={0}
      max={100}
      step={5}
    />
  );
}

export const Default: Story = { render: () => <SliderDemo /> };

export const Disabled: Story = {
  render: () => <SliderDemo disabled initial={20} />,
};
