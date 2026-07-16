import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import WetSignatureInput from "@app/components/tools/certSign/WetSignatureInput";

const meta = {
  title: "Tools/CertSign/WetSignatureInput",
  component: WetSignatureInput,
  parameters: { layout: "padded" },
} satisfies Meta<typeof WetSignatureInput>;
export default meta;
type Story = StoryObj<typeof meta>;

function WetSignatureInputDemo(
  props: Partial<React.ComponentProps<typeof WetSignatureInput>>,
) {
  const [certType, setCertType] = useState<"SERVER" | "USER_CERT" | "UPLOAD">(
    props.certType ?? "USER_CERT",
  );
  const [p12File, setP12File] = useState<File | null>(props.p12File ?? null);
  const [password, setPassword] = useState(props.password ?? "");

  return (
    <WetSignatureInput
      onSignatureDataChange={() => {}}
      onSignatureTypeChange={() => {}}
      onP12FileChange={setP12File}
      onPasswordChange={setPassword}
      {...props}
      certType={certType}
      onCertTypeChange={setCertType}
      p12File={p12File}
      password={password}
    />
  );
}

/** Default state: personal certificate selected, canvas signature type. */
export const Default: Story = {
  render: () => <WetSignatureInputDemo />,
};

/** Upload-certificate flow, revealing the P12 file and password fields. */
export const UploadCertificate: Story = {
  render: () => <WetSignatureInputDemo certType="UPLOAD" />,
};

/** All controls disabled. */
export const Disabled: Story = {
  render: () => <WetSignatureInputDemo disabled certType="UPLOAD" />,
};
