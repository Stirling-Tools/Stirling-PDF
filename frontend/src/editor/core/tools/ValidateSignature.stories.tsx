import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, waitFor } from "storybook/test";
import {
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  runTool,
  STAGE_TIMEOUT,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import type { SignatureValidationBackendResult } from "@editor/types/validateSignature";

const meta = {
  title: "Tools/Validate PDF Signature/Panel",
  ...toolPanelMeta("validateSignature", { files: ["signed-sample.pdf"] }),
};
export default meta;

type Story = StoryObj<typeof meta>;

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

export const Panel: Story = {};

export const TrustedCertificateUploaded: Story = {
  args: { parameterFiles: { certFile: "valid-test-cert.pem" } },
};

export const Results: Story = {
  parameters: toolPanelServer(
    http.post("*/api/v1/security/validate-signature", () =>
      HttpResponse.json([SIGNATURE]),
    ),
  ),
  play: async (context) => {
    const panel = await runTool(context);
    await waitFor(
      () =>
        expect(
          panel.getByRole("button", { name: "Download PDF Report" }),
        ).toBeEnabled(),
      STAGE_TIMEOUT,
    );
  },
};

export const TrustedCertificateTooltip: Story = {
  play: openTooltip({ info: /Upload a trusted X\.509 certificate/ }),
};
