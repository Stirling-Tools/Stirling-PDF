import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import PenSizeSelector from "@app/components/tools/sign/PenSizeSelector";

const meta = {
  title: "Tools/Sign/PenSizeSelector",
  component: PenSizeSelector,
} satisfies Meta<typeof PenSizeSelector>;
export default meta;
type Story = StoryObj<typeof meta>;

function PenSizeSelectorDemo({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState(5);
  const [inputValue, setInputValue] = useState("5");
  return (
    <PenSizeSelector
      value={value}
      inputValue={inputValue}
      onValueChange={setValue}
      onInputChange={setInputValue}
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <PenSizeSelectorDemo /> };

export const Disabled: Story = {
  render: () => <PenSizeSelectorDemo disabled />,
};
