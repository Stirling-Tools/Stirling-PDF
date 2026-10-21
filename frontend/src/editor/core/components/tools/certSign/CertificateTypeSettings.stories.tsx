import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import CertificateTypeSettings from "@app/components/tools/certSign/CertificateTypeSettings";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import {
  CertSignParameters,
  defaultParameters,
} from "@app/hooks/tools/certSign/useCertSignParameters";

const meta = {
  title: "Tools/CertSign/CertificateTypeSettings",
  component: CertificateTypeSettings,
  parameters: { layout: "padded" },
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof CertificateTypeSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function SettingsDemo({
  initialParameters = defaultParameters,
  disabled,
  serverCertificateEnabled = false,
  hardwareSigningAvailable = false,
}: {
  initialParameters?: CertSignParameters;
  disabled?: boolean;
  serverCertificateEnabled?: boolean;
  hardwareSigningAvailable?: boolean;
}) {
  const [parameters, setParameters] =
    useState<CertSignParameters>(initialParameters);

  return (
    <AppConfigProvider
      autoFetch={false}
      initialConfig={{ serverCertificateEnabled, hardwareSigningAvailable }}
    >
      <CertificateTypeSettings
        parameters={parameters}
        onParameterChange={(key, value) =>
          setParameters((prev) => ({ ...prev, [key]: value }))
        }
        disabled={disabled}
      />
    </AppConfigProvider>
  );
}

/** No server certificate or hardware signing available — just the informational message. */
export const Default: Story = {
  render: () => <SettingsDemo />,
};

/** Server certificate and on-device signing both available alongside upload. */
export const AllSourcesAvailable: Story = {
  render: () => (
    <SettingsDemo serverCertificateEnabled hardwareSigningAvailable />
  ),
};

/** Server certificate selected as the active source. */
export const ServerSelected: Story = {
  render: () => (
    <SettingsDemo
      serverCertificateEnabled
      hardwareSigningAvailable
      initialParameters={{
        ...defaultParameters,
        signMode: "AUTO",
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <SettingsDemo disabled serverCertificateEnabled hardwareSigningAvailable />
  ),
};
