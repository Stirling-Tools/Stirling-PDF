import type { StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  endpointUnavailable,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  openTooltip,
  type PlayContext,
  runTool,
  STAGE_TIMEOUT,
  startTool,
  uploadToPanel,
  waitForPanelText,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import type { SignatureValidationBackendResult } from "@editor/types/validateSignature";

const meta = {
  title: "Tools/Validate PDF Signature/Panel",
  ...toolPanelMeta("validateSignature", { files: ["signed-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

const ENDPOINT = "*/api/v1/security/validate-signature";

const SIGNATURE: SignatureValidationBackendResult = {
  valid: true,
  chainValid: true,
  trustValid: true,
  notExpired: true,
  coversEntireDocument: true,
  revocationChecked: false,
  revocationStatus: "not-checked",
  validationTimeSource: "signing-time",
  signerName: "Stirling Test Signer",
  signatureDate: "2026-01-15T10:30:00Z",
  reason: "Approval",
  location: "London",
  issuerDN: "CN=Stirling Test CA",
  subjectDN: "CN=Stirling Test Signer",
  serialNumber: "1A2B3C",
  validFrom: "2025-01-01T00:00:00Z",
  validUntil: "2030-01-01T00:00:00Z",
  signatureAlgorithm: "SHA256withRSA",
  keySize: 2048,
  version: 3,
  keyUsages: ["digitalSignature", "nonRepudiation"],
  selfSigned: false,
};

const validatesAs = (signatures: SignatureValidationBackendResult[]) =>
  toolPanelServer(http.post(ENDPOINT, () => HttpResponse.json(signatures)));

const validSignature = validatesAs([SIGNATURE]);

async function uploadTrustedCertificate(context: PlayContext) {
  const panel = await uploadToPanel(context, "valid-test-cert.pem");
  await panel.findByText(
    /^Signatures are checked against this certificate only/,
    undefined,
    STAGE_TIMEOUT,
  );
  return panel;
}

async function validate(context: PlayContext) {
  const panel = await runTool(context);
  await waitFor(
    () =>
      expect(
        panel.getByRole("button", { name: "Download PDF Report" }),
      ).toBeEnabled(),
    STAGE_TIMEOUT,
  );
  return panel;
}

async function pickDownloadType(context: PlayContext, type: string) {
  await validate(context);
  return choose(context, type);
}

export const Panel: Story = {};

export const NoFiles: Story = {
  args: { files: [] },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const EndpointUnavailableTooltip: Story = {
  parameters: toolPanelServer(...endpointUnavailable("validate-signature")),
  play: openTooltip({ runButton: true }),
};

export const TrustedCertificateUploaded: Story = {
  play: uploadTrustedCertificate,
};

export const TrustedCertificateCleared: Story = {
  play: async (context) => {
    const panel = await uploadTrustedCertificate(context);
    await userEvent.click(
      panel.getByRole("button", { name: "Remove certificate" }),
    );
    await panel.findByText(/^No trusted certificate/, undefined, STAGE_TIMEOUT);
  },
};

export const Validating: Story = {
  parameters: toolPanelServer(
    http.post(ENDPOINT, async () => {
      await delay("infinite");
      return HttpResponse.json([]);
    }),
  ),
  play: async (context) => {
    const panel = await startTool(context);
    await panel.findByText(
      "Validating signatures...",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const Results: Story = {
  parameters: validSignature,
  play: async (context) => {
    const panel = await validate(context);
    await expect(panel.getByText("1 fully valid")).toBeVisible();
  },
};

export const CsvDownload: Story = {
  parameters: validSignature,
  play: async (context) => {
    const panel = await pickDownloadType(context, "CSV");
    await expect(
      panel.getByRole("button", { name: "Download CSV" }),
    ).toBeEnabled();
  },
};

export const JsonDownload: Story = {
  parameters: validSignature,
  play: async (context) => {
    const panel = await pickDownloadType(context, "JSON");
    await expect(
      panel.getByRole("button", { name: "Download JSON" }),
    ).toBeEnabled();
  },
};

export const MixedResults: Story = {
  parameters: validatesAs([
    SIGNATURE,
    { ...SIGNATURE, signerName: "Unverified Signer", trustValid: false },
    { ...SIGNATURE, signerName: "Tampered Signer", valid: false },
  ]),
  play: async (context) => {
    const panel = await validate(context);
    await expect(panel.getByText("1 needs review")).toBeVisible();
    await expect(panel.getByText("1 invalid")).toBeVisible();
  },
};

export const NoSignatures: Story = {
  parameters: validatesAs([]),
  play: async (context) => {
    await runTool(context);
    await waitForPanelText(
      context,
      "No digital signatures found in this document",
    );
  },
};

export const ValidationFailed: Story = {
  parameters: toolPanelServer(
    http.post(ENDPOINT, () =>
      HttpResponse.json({ message: "Not a PDF" }, { status: 500 }),
    ),
  ),
  play: async (context) => {
    const panel = await runTool(context);
    const messages = await panel.findAllByText(
      "Unable to validate the selected files.",
      undefined,
      STAGE_TIMEOUT,
    );
    for (const message of messages) await expect(message).toBeVisible();
  },
};
