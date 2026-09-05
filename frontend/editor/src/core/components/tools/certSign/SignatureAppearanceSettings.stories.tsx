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

/**
 * With a box already placed. Worth its own story because placing a box must not make the
 * panel any taller: the reset control is always present, so no extra row appears here to
 * push the tool's run button off the bottom of the panel.
 */
export const BoxPlaced: Story = {
  render: () => (
    <SettingsDemo
      initialParameters={{
        ...defaultParameters,
        showSignature: true,
        name: "Jane Doe",
        signatureArea: { x: 320, y: 60, width: 200, height: 60 },
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
