import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import SignatureAppearanceSettings from "@app/components/tools/certSign/SignatureAppearanceSettings";
import {
  CertSignParameters,
  defaultParameters,
} from "@app/hooks/tools/certSign/useCertSignParameters";

const meta = {
  title: "Tools/CertSign/SignatureAppearanceSettings",
  component: SignatureAppearanceSettings,
  parameters: { layout: "padded" },
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof SignatureAppearanceSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function SettingsDemo({
  initialParameters = defaultParameters,
  disabled,
}: {
  initialParameters?: CertSignParameters;
  disabled?: boolean;
}) {
  const [parameters, setParameters] =
    useState<CertSignParameters>(initialParameters);

  return (
    <SignatureAppearanceSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
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
      initialParameters={{
        ...defaultParameters,
        showSignature: true,
        reason: "Approved",
        location: "Head Office",
        name: "Jane Doe",
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <SettingsDemo
      disabled
      initialParameters={{ ...defaultParameters, showSignature: true }}
    />
  ),
};
