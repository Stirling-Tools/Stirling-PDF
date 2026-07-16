import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CertificateSelector,
  CertificateType,
  UploadFormat,
} from "@app/components/tools/certSign/CertificateSelector";

const meta = {
  title: "Tools/CertSign/CertificateSelector",
  component: CertificateSelector,
  parameters: { layout: "padded" },
} satisfies Meta<typeof CertificateSelector>;
export default meta;
type Story = StoryObj<typeof meta>;

function SelectorDemo({
  initialCertType = "UPLOAD",
  initialUploadFormat = "PKCS12",
  disabled,
}: {
  initialCertType?: CertificateType;
  initialUploadFormat?: UploadFormat;
  disabled?: boolean;
}) {
  const [certType, setCertType] = useState<CertificateType>(initialCertType);
  const [uploadFormat, setUploadFormat] =
    useState<UploadFormat>(initialUploadFormat);
  const [p12File, setP12File] = useState<File | null>(null);
  const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [jksFile, setJksFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");

  return (
    <CertificateSelector
      certType={certType}
      onCertTypeChange={setCertType}
      uploadFormat={uploadFormat}
      onUploadFormatChange={setUploadFormat}
      p12File={p12File}
      onP12FileChange={setP12File}
      privateKeyFile={privateKeyFile}
      onPrivateKeyFileChange={setPrivateKeyFile}
      certFile={certFile}
      onCertFileChange={setCertFile}
      jksFile={jksFile}
      onJksFileChange={setJksFile}
      password={password}
      onPasswordChange={setPassword}
      disabled={disabled}
    />
  );
}

export const Default: Story = {
  render: () => <SelectorDemo />,
};

export const PemFormat: Story = {
  render: () => <SelectorDemo initialUploadFormat="PEM" />,
};

export const Disabled: Story = {
  render: () => <SelectorDemo disabled />,
};
