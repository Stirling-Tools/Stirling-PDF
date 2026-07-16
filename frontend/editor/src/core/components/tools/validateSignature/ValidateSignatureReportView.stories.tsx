import type { Meta, StoryObj } from "@storybook/react-vite";
import ValidateSignatureReportView from "@app/components/tools/validateSignature/ValidateSignatureReportView";
import type {
  SignatureValidationReportData,
  SignatureValidationSignature,
} from "@app/types/validateSignature";

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
  signatureDate: "2026-05-12T10:30:00Z",
  reason: "Approved",
  location: "London, UK",
  issuerDN: "CN=Example CA, O=Example Corp",
  subjectDN: "CN=Jane Doe, O=Example Corp",
  serialNumber: "1A2B3C4D5E",
  validFrom: "2025-01-01T00:00:00Z",
  validUntil: "2027-01-01T00:00:00Z",
  signatureAlgorithm: "SHA256withRSA",
  keySize: 2048,
  version: "1",
  keyUsages: ["digitalSignature", "nonRepudiation"],
  selfSigned: false,
  errorMessage: null,
};

const validData: SignatureValidationReportData = {
  generatedAt: Date.parse("2026-05-12T11:00:00Z"),
  entries: [
    {
      fileId: "file-1",
      fileName: "contract.pdf",
      fileSize: 245_760,
      lastModified: Date.parse("2026-05-12T10:30:00Z"),
      thumbnailUrl: null,
      createdAtLabel: "12 May 2026",
      signatures: [baseSignature],
    },
  ],
};

const multiSignatureData: SignatureValidationReportData = {
  generatedAt: Date.parse("2026-05-12T11:00:00Z"),
  entries: [
    {
      fileId: "file-1",
      fileName: "agreement.pdf",
      fileSize: 512_000,
      lastModified: Date.parse("2026-05-12T10:30:00Z"),
      thumbnailUrl: null,
      createdAtLabel: "12 May 2026",
      signatures: [
        baseSignature,
        {
          ...baseSignature,
          id: "sig-2",
          signerName: "John Smith",
          valid: false,
          chainValid: false,
          trustValid: false,
          chainValidationError: "Certificate chain could not be verified",
          errorMessage: "Untrusted certificate",
        },
      ],
    },
  ],
};

const noSignaturesData: SignatureValidationReportData = {
  generatedAt: Date.parse("2026-05-12T11:00:00Z"),
  entries: [
    {
      fileId: "file-2",
      fileName: "unsigned-report.pdf",
      fileSize: 128_000,
      lastModified: Date.parse("2026-05-12T10:30:00Z"),
      thumbnailUrl: null,
      createdAtLabel: "12 May 2026",
      signatures: [],
    },
  ],
};

const errorData: SignatureValidationReportData = {
  generatedAt: Date.parse("2026-05-12T11:00:00Z"),
  entries: [
    {
      fileId: "file-3",
      fileName: "corrupted.pdf",
      fileSize: 64_000,
      lastModified: Date.parse("2026-05-12T10:30:00Z"),
      thumbnailUrl: null,
      createdAtLabel: "12 May 2026",
      signatures: [],
      error: "Unable to parse document signatures",
    },
  ],
};

const meta = {
  title: "Tools/ValidateSignature/ValidateSignatureReportView",
  component: ValidateSignatureReportView,
  parameters: { layout: "padded" },
  args: {
    data: validData,
  },
} satisfies Meta<typeof ValidateSignatureReportView>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MultipleSignatures: Story = {
  args: {
    data: multiSignatureData,
  },
};

export const NoSignatures: Story = {
  args: {
    data: noSignaturesData,
  },
};

export const Error: Story = {
  args: {
    data: errorData,
  },
};
