import type { Meta, StoryObj } from "@storybook/react-vite";
import SignatureStatusBadge from "@app/components/tools/validateSignature/reportView/SignatureStatusBadge";
import type { SignatureValidationSignature } from "@app/types/validateSignature";

const baseSignature: SignatureValidationSignature = {
  id: "sig-1",
  valid: true,
  chainValid: true,
  trustValid: true,
  chainValidationError: null,
  certPathLength: 2,
  notExpired: true,
  coversEntireDocument: true,
  revocationChecked: true,
  revocationStatus: "good",
  validationTimeSource: "signing-time",
  signerName: "Jane Doe",
  signatureDate: "2026-06-01T12:00:00Z",
  reason: "Document approval",
  location: "London, UK",
  issuerDN: "CN=Stirling PDF CA",
  subjectDN: "CN=Jane Doe",
  serialNumber: "0123456789ABCDEF",
  validFrom: "2025-01-01T00:00:00Z",
  validUntil: "2027-01-01T00:00:00Z",
  signatureAlgorithm: "SHA256withRSA",
  keySize: 2048,
  version: "2",
  keyUsages: ["digitalSignature", "nonRepudiation"],
  selfSigned: false,
  errorMessage: null,
};

const meta = {
  title: "Tools/ValidateSignature/SignatureStatusBadge",
  component: SignatureStatusBadge,
} satisfies Meta<typeof SignatureStatusBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    signature: baseSignature,
  },
};

export const UntrustedSigner: Story = {
  args: {
    signature: {
      ...baseSignature,
      id: "sig-2",
      trustValid: false,
      chainValid: false,
      selfSigned: true,
    },
  },
};

export const Invalid: Story = {
  args: {
    signature: {
      ...baseSignature,
      id: "sig-3",
      valid: false,
      errorMessage: "Signature does not match document contents",
    },
  },
};
