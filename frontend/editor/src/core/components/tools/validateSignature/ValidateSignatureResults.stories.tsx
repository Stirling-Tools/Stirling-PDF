import type { Meta, StoryObj } from "@storybook/react-vite";
import ValidateSignatureResults from "@app/components/tools/validateSignature/ValidateSignatureResults";
import type { ValidateSignatureOperationHook } from "@app/hooks/tools/validateSignature/useValidateSignatureOperation";
import type { SignatureValidationReportEntry } from "@app/types/validateSignature";
import { AppProviders } from "@app/components/AppProviders";

// The results view unconditionally renders SuggestedToolsSection, which reads
// the tool list via useSuggestedTools — pulling from NavigationContext and
// ToolWorkflowContext. Mount the real provider tree rather than stubbing each
// one individually.
function withProviders(Story: () => JSX.Element) {
  return (
    <AppProviders
      appConfigProviderProps={{
        initialConfig: {},
        bootstrapMode: "non-blocking",
        autoFetch: false,
      }}
    >
      <Story />
    </AppProviders>
  );
}

const validSignature: SignatureValidationReportEntry["signatures"][number] = {
  id: "sig-1",
  valid: true,
  chainValid: true,
  trustValid: true,
  notExpired: true,
  coversEntireDocument: true,
  revocationChecked: true,
  revocationStatus: "good",
  validationTimeSource: "signing-time",
  signerName: "Jane Doe",
  signatureDate: "2026-05-01T10:00:00Z",
  reason: "I approve this document",
  location: "London, UK",
  issuerDN: "CN=Stirling Root CA",
  subjectDN: "CN=Jane Doe",
  serialNumber: "01A2B3",
  validFrom: "2025-01-01T00:00:00Z",
  validUntil: "2027-01-01T00:00:00Z",
  signatureAlgorithm: "SHA256withRSA",
  keySize: 2048,
  version: "2",
  keyUsages: ["digitalSignature"],
  selfSigned: false,
  errorMessage: null,
};

const untrustedSignature: SignatureValidationReportEntry["signatures"][number] =
  {
    ...validSignature,
    id: "sig-2",
    trustValid: false,
    selfSigned: true,
    signerName: "Self-Signed Signer",
  };

const validEntry: SignatureValidationReportEntry = {
  fileId: "file-1",
  fileName: "contract-signed.pdf",
  signatures: [validSignature],
  error: null,
  fileSize: 245_760,
  lastModified: Date.now(),
};

const warningEntry: SignatureValidationReportEntry = {
  fileId: "file-2",
  fileName: "invoice-untrusted.pdf",
  signatures: [untrustedSignature],
  error: null,
  fileSize: 128_000,
  lastModified: Date.now(),
};

const noSignatureEntry: SignatureValidationReportEntry = {
  fileId: "file-3",
  fileName: "plain-document.pdf",
  signatures: [],
  error: null,
  fileSize: 64_000,
  lastModified: Date.now(),
};

const baseOperation: ValidateSignatureOperationHook = {
  files: [],
  thumbnails: [],
  isGeneratingThumbnails: false,
  downloadUrl: null,
  downloadFilename: "",
  isLoading: false,
  status: "",
  errorMessage: null,
  progress: null,
  executeOperation: async () => {},
  resetResults: () => {},
  clearError: () => {},
  cancelOperation: () => {},
  undoOperation: async () => {},
  results: [],
};

const meta = {
  title: "Tools/ValidateSignature/ValidateSignatureResults",
  component: ValidateSignatureResults,
  decorators: [withProviders],
} satisfies Meta<typeof ValidateSignatureResults>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    operation: {
      ...baseOperation,
      results: [validEntry, warningEntry, noSignatureEntry],
      files: [
        new File(["%PDF-1.7"], "validation-report.pdf", {
          type: "application/pdf",
        }),
      ],
    },
    results: [validEntry, warningEntry, noSignatureEntry],
    isLoading: false,
    errorMessage: null,
  },
};

export const Loading: Story = {
  args: {
    operation: { ...baseOperation, results: [] },
    results: [],
    isLoading: true,
    errorMessage: null,
  },
};

export const Empty: Story = {
  args: {
    operation: { ...baseOperation, results: [] },
    results: [],
    isLoading: false,
    errorMessage: null,
  },
};
