import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import HardwareCertificateSettings from "@app/components/tools/certSign/HardwareCertificateSettings";
import { CertSignParameters } from "@app/hooks/tools/certSign/useCertSignParameters";

const meta = {
  title: "Tools/CertSign/HardwareCertificateSettings",
  component: HardwareCertificateSettings,
} satisfies Meta<typeof HardwareCertificateSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

// The component owns no state itself, so each story wraps it in a small
// stateful shim to keep the kind toggle / driver / PIN inputs interactive
// in the canvas. Capability + certificate lookups hit the backend and are
// expected to fail in Storybook - the component treats that as best-effort
// and still renders the picker.
const HardwareCertificateSettingsDemo = (props: {
  initialParameters: CertSignParameters;
  disabled?: boolean;
}) => {
  const [parameters, setParameters] = useState<CertSignParameters>(
    props.initialParameters,
  );

  return (
    <HardwareCertificateSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={props.disabled}
    />
  );
};

const baseParameters: CertSignParameters = {
  signMode: "DEVICE",
  certType: "WINDOWS_STORE",
  password: "",
  showSignature: false,
  reason: "",
  location: "",
  name: "",
  pageNumber: 1,
  showLogo: true,
};

export const Default: Story = {
  render: () => (
    <HardwareCertificateSettingsDemo initialParameters={baseParameters} />
  ),
};

export const Pkcs11: Story = {
  render: () => (
    <HardwareCertificateSettingsDemo
      initialParameters={{
        ...baseParameters,
        certType: "PKCS11",
        password: "1234",
      }}
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <HardwareCertificateSettingsDemo
      initialParameters={baseParameters}
      disabled
    />
  ),
};
