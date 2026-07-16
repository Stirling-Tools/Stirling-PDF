import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import SignatureSettingsInput, {
  SignatureSettings,
} from "@app/components/tools/certSign/SignatureSettingsInput";

const meta = {
  title: "Tools/CertSign/SignatureSettingsInput",
  component: SignatureSettingsInput,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SignatureSettingsInput>;
export default meta;
type Story = StoryObj<typeof meta>;

function SettingsDemo({
  initialValue = {},
  disabled,
}: {
  initialValue?: SignatureSettings;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<SignatureSettings>(initialValue);

  return (
    <SignatureSettingsInput
      value={value}
      onChange={setValue}
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <SettingsDemo />,
};

export const VisibleSignature: Story = {
  render: () => (
    <SettingsDemo
      initialValue={{
        showSignature: true,
        reason: "Contract approval",
        location: "London, UK",
        pageNumber: 1,
        showLogo: true,
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <SettingsDemo disabled initialValue={{ showSignature: true }} />
  ),
};
