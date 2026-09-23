import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CertificateSelectionStep } from "@app/components/tools/certSign/steps/CertificateSelectionStep";
import {
  CertificateType,
  UploadFormat,
} from "@app/components/tools/certSign/CertificateSelector";

const meta = {
  title: "Tools/CertSign/CertificateSelectionStep",
  component: CertificateSelectionStep,
  parameters: { layout: "padded" },
  args: {
    certType: "UPLOAD",
    onCertTypeChange: () => {},
    uploadFormat: "PKCS12",
    onUploadFormatChange: () => {},
    p12File: null,
    onP12FileChange: () => {},
    privateKeyFile: null,
    onPrivateKeyFileChange: () => {},
    certFile: null,
    onCertFileChange: () => {},
    jksFile: null,
    onJksFileChange: () => {},
    password: "",
    onPasswordChange: () => {},
    onBack: () => {},
    onNext: () => {},
  },
} satisfies Meta<typeof CertificateSelectionStep>;
export default meta;
type Story = StoryObj<typeof meta>;

function StepDemo({
  initialCertType = "UPLOAD",
  initialUploadFormat = "PKCS12",
  withUploadedFile = false,
  disabled,
}: {
  initialCertType?: CertificateType;
  initialUploadFormat?: UploadFormat;
  withUploadedFile?: boolean;
  disabled?: boolean;
}) {
  const [certType, setCertType] = useState<CertificateType>(initialCertType);
  const [uploadFormat, setUploadFormat] =
    useState<UploadFormat>(initialUploadFormat);
  const [p12File, setP12File] = useState<File | null>(
    withUploadedFile
      ? new File(["mock"], "certificate.p12", {
          type: "application/x-pkcs12",
        })
      : null,
  );
  const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [jksFile, setJksFile] = useState<File | null>(null);
  const [password, setPassword] = useState(withUploadedFile ? "secret" : "");

  return (
    <CertificateSelectionStep
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
      onBack={() => {}}
      onNext={() => {}}
      disabled={disabled}
    />
  );
}

/** Upload flow with no file/password yet — "Continue" stays disabled. */
export const Default: Story = {
  render: () => <StepDemo />,
};

/** Upload flow with a certificate + password already provided — "Continue" is enabled. */
export const UploadReady: Story = {
  render: () => <StepDemo withUploadedFile />,
};

/** Pre-installed user certificate — always valid, no upload fields required. */
export const UserCertificate: Story = {
  render: () => <StepDemo initialCertType="USER_CERT" />,
};

/** Whole step disabled (e.g. while a request is in flight). */
export const Disabled: Story = {
  render: () => <StepDemo withUploadedFile disabled />,
};
