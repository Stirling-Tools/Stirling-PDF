import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  SignatureTypeSelector,
  type SignatureType,
} from "@app/components/shared/wetSignature/SignatureTypeSelector";

const meta: Meta<typeof SignatureTypeSelector> = {
  title: "Shared/WetSignature/SignatureTypeSelector",
  component: SignatureTypeSelector,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof SignatureTypeSelector>;

function SignatureTypeSelectorDemo({
  initialValue = "draw",
  disabled,
}: {
  initialValue?: SignatureType;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<SignatureType>(initialValue);
  return (
    <SignatureTypeSelector
      value={value}
      onChange={setValue}
      disabled={disabled}
    />
  );
}

export const Default: Story = { render: () => <SignatureTypeSelectorDemo /> };

export const Disabled: Story = {
  render: () => <SignatureTypeSelectorDemo disabled />,
};
