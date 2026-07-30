import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewSignatureStep } from "@app/components/tools/certSign/steps/ReviewSignatureStep";
import type { SignRequestDetail } from "@app/types/signingSession";

const signRequest: SignRequestDetail = {
  sessionId: "session-1",
  documentName: "Contract.pdf",
  ownerUsername: "owner@example.com",
  message: "Please sign the attached contract.",
  dueDate: "2026-08-01T00:00:00Z",
  createdAt: "2026-07-15T00:00:00Z",
  myStatus: "VIEWED",
  showSignature: true,
  pageNumber: 1,
  reason: "Contract approval",
  location: "London, UK",
};

const meta = {
  title: "CertSign/ReviewSignatureStep",
  component: ReviewSignatureStep,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ReviewSignatureStep>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    signatureCount: 1,
    certType: "USER_CERT",
    uploadFormat: "PKCS12",
    p12File: null,
    signRequest,
    onBack: () => {},
    onSign: () => {},
    onDecline: () => {},
  },
};

export const MultipleSignatures: Story = {
  args: {
    ...Default.args,
    signatureCount: 3,
    certType: "SERVER",
  },
};

export const UploadedCertificateDisabled: Story = {
  args: {
    ...Default.args,
    certType: "UPLOAD",
    uploadFormat: "PFX",
    p12File: new File(["dummy"], "my-cert.pfx"),
    disabled: true,
  },
};
