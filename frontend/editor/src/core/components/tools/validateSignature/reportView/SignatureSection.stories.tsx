import type { Meta, StoryObj } from "@storybook/react-vite";
import SignatureSection from "@app/components/tools/validateSignature/reportView/SignatureSection";
import type { SignatureValidationSignature } from "@app/types/validateSignature";

const buildSignature = (
  overrides: Partial<SignatureValidationSignature> = {},
): SignatureValidationSignature => ({
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
  signatureDate: "2026-06-01T10:00:00Z",
  reason: "Approved",
  location: "London, UK",
  issuerDN: "CN=Example CA, O=Example Corp",
  subjectDN: "CN=Jane Doe, O=Example Corp",
  serialNumber: "0x4F2A9C",
  validFrom: "2025-01-01T00:00:00Z",
  validUntil: "2027-01-01T00:00:00Z",
  signatureAlgorithm: "SHA256withRSA",
  keySize: 2048,
  version: "3",
  keyUsages: ["digitalSignature", "nonRepudiation"],
  selfSigned: false,
  errorMessage: null,
  ...overrides,
});

const meta = {
  title: "Tools/ValidateSignature/SignatureSection",
  component: SignatureSection,
} satisfies Meta<typeof SignatureSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    signature: buildSignature(),
    index: 0,
  },
};

export const InvalidWithError: Story = {
  args: {
    signature: buildSignature({
      valid: false,
      chainValid: false,
      trustValid: false,
      notExpired: false,
      errorMessage: "Certificate has expired",
    }),
    index: 1,
  },
};

export const SelfSignedMinimalData: Story = {
  args: {
    signature: buildSignature({
      signerName: "",
      reason: "",
      location: "",
      issuerDN: "",
      subjectDN: "",
      serialNumber: "",
      keySize: null,
      version: "",
      keyUsages: [],
      selfSigned: true,
    }),
    index: 2,
  },
};
