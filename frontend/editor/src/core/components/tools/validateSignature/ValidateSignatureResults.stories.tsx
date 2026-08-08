/**
 * The report shown after validating signatures. A signature's badge is derived
 * rather than given: a failed cryptographic check is Invalid, anything that
 * passes but carries a trust caveat — self-signed, expired, revoked, or content
 * appended after signing — downgrades to a warning, and only a clean signature
 * reads as Valid. Each fixture below sets the fields that produce one of those
 * three, rather than naming the status directly.
 *
 * The download row offers whichever report formats the operation produced, so
 * stories vary `operation.files` to show it with one format and with all three.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import ValidateSignatureResults from "@app/components/tools/validateSignature/ValidateSignatureResults";
import type {
  SignatureValidationReportEntry,
  SignatureValidationSignature,
} from "@app/types/validateSignature";
import type { ValidateSignatureOperationHook } from "@app/hooks/tools/validateSignature/useValidateSignatureOperation";
import {
  NavigationStateContext,
  type NavigationContextStateValue,
} from "@app/contexts/NavigationContext";
import {
  ToolWorkflowContext,
  ToolWorkflowActionsContext,
  type ToolWorkflowContextValue,
  type ToolWorkflowActionsValue,
} from "@app/contexts/ToolWorkflowContext";

function signature(
  id: string,
  overrides: Partial<SignatureValidationSignature> = {},
): SignatureValidationSignature {
  return {
    id,
    valid: true,
    chainValid: true,
    trustValid: true,
    notExpired: true,
    coversEntireDocument: true,
    revocationChecked: true,
    revocationStatus: "good",
    signerName: "A. Whitfield",
    signatureDate: "2026-02-11T14:05:00Z",
    reason: "Approval",
    location: "Manchester, UK",
    issuerDN: "CN=Example Issuing CA, O=Example Trust",
    subjectDN: "CN=A. Whitfield, O=Example Ltd",
    serialNumber: "3F:AA:19:04",
    validFrom: "2025-06-01T00:00:00Z",
    validUntil: "2027-06-01T00:00:00Z",
    signatureAlgorithm: "SHA256withRSA",
    keySize: 2048,
    version: "1",
    keyUsages: ["digitalSignature", "nonRepudiation"],
    selfSigned: false,
    errorMessage: null,
    ...overrides,
  };
}

function entry(
  fileName: string,
  signatures: SignatureValidationSignature[],
): SignatureValidationReportEntry {
  return {
    fileId: fileName,
    fileName,
    signatures,
    fileSize: 184_320,
    lastModified: Date.parse("2026-02-11T14:06:00Z"),
  };
}

const file = (name: string) => new File(["report"], name);

/** No report files means the download row has nothing to offer. */
function op(names: string[] = []): ValidateSignatureOperationHook {
  return {
    files: names.map(file),
  } as unknown as ValidateSignatureOperationHook;
}

const VALID = entry("contract-signed.pdf", [signature("sig-1")]);

/** Cryptographically sound, but the document grew after it was signed. */
const WARNING = entry("addendum-appended.pdf", [
  signature("sig-1", { coversEntireDocument: false }),
]);

/** A self-signed certificate that is not a trust anchor. */
const SELF_SIGNED = entry("internal-memo.pdf", [
  signature("sig-1", { selfSigned: true, trustValid: false }),
]);

const INVALID = entry("tampered.pdf", [signature("sig-1", { valid: false })]);

/** A backend error against one file, which reads as invalid too. */
const ERRORED = entry("unreadable.pdf", [
  signature("sig-1", { errorMessage: "Signature could not be parsed" }),
]);

/**
 * The report ends with a "what next" strip of suggested tools, which reaches
 * navigation and the tool workflow. Only three fields are read between them, so
 * the decorator supplies those rather than mounting either provider.
 */
const withSuggestedTools = (Story: () => React.ReactElement) => (
  <NavigationStateContext.Provider
    value={{ selectedTool: null } as unknown as NavigationContextStateValue}
  >
    <ToolWorkflowContext.Provider
      value={
        { getSelectedTool: () => null } as unknown as ToolWorkflowContextValue
      }
    >
      <ToolWorkflowActionsContext.Provider
        value={
          { handleToolSelect: () => {} } as unknown as ToolWorkflowActionsValue
        }
      >
        <Story />
      </ToolWorkflowActionsContext.Provider>
    </ToolWorkflowContext.Provider>
  </NavigationStateContext.Provider>
);

const meta: Meta<typeof ValidateSignatureResults> = {
  title: "Tools/ValidateSignature/Results",
  component: ValidateSignatureResults,
  parameters: { layout: "padded" },
  decorators: [withSuggestedTools],
  args: {
    operation: op(["report.pdf"]),
    isLoading: false,
    errorMessage: null,
    results: [VALID],
  },
};
export default meta;

type Story = StoryObj<typeof ValidateSignatureResults>;

export const Valid: Story = {};

export const TrustWarning: Story = { args: { results: [WARNING] } };

export const SelfSignedWarning: Story = { args: { results: [SELF_SIGNED] } };

export const Invalid: Story = { args: { results: [INVALID] } };

export const SignatureError: Story = { args: { results: [ERRORED] } };

/** The summary counts across a mixed batch, which is the usual real case. */
export const MixedBatch: Story = {
  args: { results: [VALID, WARNING, INVALID, SELF_SIGNED] },
};

/** Several signatures on one document, each judged separately. */
export const MultipleSignatures: Story = {
  args: {
    results: [
      entry("counter-signed.pdf", [
        signature("sig-1"),
        signature("sig-2", { selfSigned: true, trustValid: false }),
        signature("sig-3", { valid: false }),
      ]),
    ],
  },
};

/** Nothing validated yet. */
export const Loading: Story = { args: { isLoading: true, results: [] } };

/** Still working, with partial results already on screen. */
export const LoadingWithResults: Story = {
  args: { isLoading: true, results: [VALID] },
};

export const Empty: Story = { args: { results: [] } };

export const WithError: Story = {
  args: { errorMessage: "The validation service did not respond." },
};

/** All three report formats available to download. */
export const AllReportFormats: Story = {
  args: { operation: op(["report.pdf", "report.csv", "report.json"]) },
};
