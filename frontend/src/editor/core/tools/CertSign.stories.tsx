import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  appConfig,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  openTooltip,
  STAGE_TIMEOUT,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import type {
  HardwareCertificateInfo,
  HardwareSigningCapabilities,
} from "@editor/services/hardwareSigningService";

const meta = {
  title: "Tools/Sign with Certificate/Panel",
  ...toolPanelMeta("certSign"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const HARDWARE = "/api/v1/security/cert-sign/hardware";

const OPENSC = { name: "OpenSC", path: "/usr/lib/opensc-pkcs11.so" };

const capabilities = (
  detectedLibraries: HardwareSigningCapabilities["detectedLibraries"],
): HardwareSigningCapabilities => ({
  desktop: true,
  osName: "Windows 11",
  windowsStoreSupported: true,
  pkcs11Supported: true,
  detectedLibraries,
});

const certificate = (
  alias: string,
  source: HardwareCertificateInfo["source"],
  overrides: Partial<HardwareCertificateInfo> = {},
): HardwareCertificateInfo => ({
  alias,
  source,
  subject: `CN=${alias}`,
  issuer: "CN=Example Issuing CA",
  subjectCommonName: alias,
  issuerCommonName: "Example Issuing CA",
  serialNumber: "01",
  keyAlgorithm: "RSA",
  notBefore: "2026-01-01T00:00:00Z",
  notAfter: "2028-01-01T00:00:00Z",
  expired: false,
  notYetValid: false,
  ...overrides,
});

const certificateSources = appConfig({
  serverCertificateEnabled: true,
  hardwareSigningAvailable: true,
});

const withHardware = (
  detectedLibraries: HardwareSigningCapabilities["detectedLibraries"],
) =>
  toolPanelServer(
    certificateSources,
    http.get(`${HARDWARE}/capabilities`, () =>
      HttpResponse.json(capabilities(detectedLibraries)),
    ),
    http.get(`${HARDWARE}/windows-certificates`, () =>
      HttpResponse.json([
        certificate("Jane Signer", "WINDOWS_STORE"),
        certificate("Old Signing Key", "WINDOWS_STORE", {
          notAfter: "2025-01-01T00:00:00Z",
          expired: true,
        }),
      ]),
    ),
    http.post(`${HARDWARE}/pkcs11-certificates`, () =>
      HttpResponse.json([
        certificate("Jane Signer (token)", "PKCS11"),
        certificate("Jane Authentication", "PKCS11"),
      ]),
    ),
  );

export const Panel: Story = {};

export const Pkcs12Uploaded: Story = {
  args: {
    parameters: { certType: "PKCS12" },
    parameterFiles: { p12File: "valid-test.p12" },
  },
};

export const PemPrivateKey: Story = {
  args: { parameters: { certType: "PEM" } },
};

export const PemUploaded: Story = {
  args: {
    parameters: { certType: "PEM" },
    parameterFiles: {
      privateKeyFile: "valid-test-key.pem",
      certFile: "valid-test-cert.pem",
    },
  },
};

export const VisibleSignature: Story = {
  args: { parameters: { showSignature: true } },
};

export const CertificateSources: Story = {
  parameters: toolPanelServer(certificateSources),
  play: async (context) => {
    const panel = await choose(context);
    await panel.findByRole("radio", { name: "Server" }, STAGE_TIMEOUT);
  },
};

export const ServerCertificate: Story = {
  parameters: toolPanelServer(certificateSources),
  play: async (context) => {
    const panel = await choose(context, "Server");
    await waitFor(() => expect(panel.queryByText("Format")).toBeNull());
  },
};

export const WindowsCertificateStore: Story = {
  parameters: withHardware([OPENSC]),
  play: async (context) => {
    const panel = await choose(context, "This device");
    await panel.findByDisplayValue(/^Jane Signer · /, undefined, STAGE_TIMEOUT);
  },
};

export const UsbToken: Story = {
  parameters: withHardware([OPENSC]),
  play: async (context) => {
    const panel = await choose(context, "This device", "USB Token");
    await panel.findByText(OPENSC.path, undefined, STAGE_TIMEOUT);
  },
};

export const UsbTokenCertificates: Story = {
  args: { parameters: { password: "123456" } },
  parameters: withHardware([OPENSC]),
  play: async (context) => {
    const panel = await choose(context, "This device", "USB Token");
    const list = await panel.findByRole("button", {
      name: "List certificates",
    });
    await waitFor(() => expect(list).toBeEnabled());
    await userEvent.click(list);
    await panel.findByPlaceholderText(
      "Select certificate",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const UsbTokenNoDriverDetected: Story = {
  args: {
    parameters: { pkcs11LibraryPath: "/opt/token/libpkcs11.so" },
  },
  parameters: withHardware([]),
  play: async (context) => {
    const panel = await choose(context, "This device", "USB Token");
    await panel.findByDisplayValue(
      "/opt/token/libpkcs11.so",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const CertificateSourceTooltip: Story = {
  parameters: toolPanelServer(certificateSources),
  play: openTooltip({ step: "Certificate source" }),
};

export const CertificateTooltip: Story = {
  play: openTooltip({ step: "Certificate" }),
};

export const SignatureAppearanceTooltip: Story = {
  play: openTooltip({ step: "Signature Appearance" }),
};
