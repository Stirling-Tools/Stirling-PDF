import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import CertSignAutomationSettings from "@app/components/tools/certSign/CertSignAutomationSettings";
import {
  CertSignParameters,
  defaultParameters,
} from "@app/hooks/tools/certSign/useCertSignParameters";

const meta = {
  title: "Tools/CertSign/CertSignAutomationSettings",
  component: CertSignAutomationSettings,
  parameters: { layout: "padded" },
} satisfies Meta<typeof CertSignAutomationSettings>;
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
    <CertSignAutomationSettings
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

export const AutoSignMode: Story = {
  render: () => (
    <SettingsDemo
      initialParameters={{
        ...defaultParameters,
        signMode: "AUTO",
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => <SettingsDemo disabled />,
};
