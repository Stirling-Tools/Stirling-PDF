import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import CertificateFilesSettings from "@app/components/tools/certSign/CertificateFilesSettings";
import {
  CertSignParameters,
  defaultParameters,
} from "@app/hooks/tools/certSign/useCertSignParameters";

const meta = {
  title: "Tools/CertSign/CertificateFilesSettings",
  component: CertificateFilesSettings,
  parameters: { layout: "padded" },
} satisfies Meta<typeof CertificateFilesSettings>;
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
    <CertificateFilesSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => (
    <SettingsDemo
      initialParameters={{ ...defaultParameters, certType: "PEM" }}
    />
  ),
};

export const Pkcs12: Story = {
  render: () => (
    <SettingsDemo
      initialParameters={{ ...defaultParameters, certType: "PKCS12" }}
    />
  ),
};

export const Jks: Story = {
  render: () => (
    <SettingsDemo
      initialParameters={{ ...defaultParameters, certType: "JKS" }}
    />
  ),
};

export const AutoSignMode: Story = {
  render: () => (
    <SettingsDemo
      initialParameters={{ ...defaultParameters, signMode: "AUTO" }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <SettingsDemo
      initialParameters={{ ...defaultParameters, certType: "PEM" }}
      disabled
    />
  ),
};
