import type { StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  appConfig,
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  choose,
  findEnabled,
  openSelect,
  openTooltip,
  panelOf,
  type PlayContext,
  runToResults,
  STAGE_TIMEOUT,
  uploadToPanel,
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

const HARDWARE = "*/api/v1/security/cert-sign/hardware";

const OPENSC = { name: "OpenSC", path: "/usr/lib/opensc-pkcs11.so" };

const capabilities = (
  detectedLibraries: HardwareSigningCapabilities["detectedLibraries"],
  windowsStoreSupported = true,
): HardwareSigningCapabilities => ({
  desktop: true,
  osName: windowsStoreSupported ? "Windows 11" : "Linux",
  windowsStoreSupported,
  macKeychainSupported: false,
  pkcs11Supported: true,
  detectedLibraries,
});

const certificate = (
  alias: string,
  overrides: Partial<HardwareCertificateInfo> = {},
): HardwareCertificateInfo => ({
  alias,
  source: "WINDOWS_STORE",
  subject: `CN=${alias}`,
  displaySubject: `CN=${alias}`,
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

const WINDOWS_CERTIFICATES = [
  certificate("Jane Signer"),
  certificate("Old Signing Key", {
    notAfter: "2025-01-01T00:00:00Z",
    expired: true,
  }),
  certificate("Next Year Key", {
    notBefore: "2030-01-01T00:00:00Z",
    notYetValid: true,
  }),
];

const TOKEN_CERTIFICATES = [
  certificate("Jane Signer (token)", { source: "PKCS11" }),
  certificate("Jane Authentication", { source: "PKCS11" }),
];

const serverCertificateOnly = appConfig({ serverCertificateEnabled: true });

const everyCertificateSource = appConfig({
  serverCertificateEnabled: true,
  hardwareSigningAvailable: true,
});

interface DeviceServer {
  detectedLibraries?: HardwareSigningCapabilities["detectedLibraries"];
  windowsStoreSupported?: boolean;
  windowsCertificates?: () => Promise<Response> | Response;
  tokenCertificates?: () => Promise<Response> | Response;
  capabilitiesResponse?: () => Promise<Response> | Response;
}

const withDevice = ({
  detectedLibraries = [OPENSC],
  windowsStoreSupported = true,
  windowsCertificates = () => HttpResponse.json(WINDOWS_CERTIFICATES),
  tokenCertificates = () => HttpResponse.json(TOKEN_CERTIFICATES),
  capabilitiesResponse = () =>
    HttpResponse.json(capabilities(detectedLibraries, windowsStoreSupported)),
}: DeviceServer = {}) =>
  toolPanelServer(
    everyCertificateSource,
    http.get(`${HARDWARE}/capabilities`, capabilitiesResponse),
    http.get(`${HARDWARE}/windows-certificates`, windowsCertificates),
    http.post(`${HARDWARE}/pkcs11-certificates`, tokenCertificates),
  );

const hardwareError = (message: string) => () =>
  HttpResponse.json({ message }, { status: 500 });

const neverAnswers = async () => {
  await delay("infinite");
  return HttpResponse.json([]);
};

const signsSample = toolPanelServer(
  fixtureResponse("/api/v1/security/cert-sign", "signed-sample.pdf"),
);

async function press(context: PlayContext, name: string) {
  await userEvent.click(await findEnabled(context, "button", name));
  return panelOf(context);
}

async function uploadP12(context: PlayContext) {
  await choose(context, "PKCS12");
  const panel = await uploadToPanel(context, "valid-test.p12");
  await panel.findByLabelText("Certificate Password", undefined, STAGE_TIMEOUT);
  await panel.findByRole(
    "switch",
    { name: "Show signature on page" },
    STAGE_TIMEOUT,
  );
  return panel;
}

async function showVisibleSignature(context: PlayContext) {
  const panel = await uploadP12(context);
  await userEvent.click(
    panel.getByRole("switch", { name: "Show signature on page" }),
  );
  await panel.findByText("Beside the details", undefined, STAGE_TIMEOUT);
  return panel;
}

async function pickPem(context: PlayContext) {
  const panel = await choose(context, "PEM");
  await panel.findByRole(
    "button",
    { name: "Choose Private Key File" },
    STAGE_TIMEOUT,
  );
  return panel;
}

async function uploadPemKey(context: PlayContext) {
  await pickPem(context);
  const panel = await uploadToPanel(context, "valid-test-key.pem");
  await panel.findByRole(
    "button",
    { name: "Choose Certificate File" },
    STAGE_TIMEOUT,
  );
  return panel;
}

async function sign(context: PlayContext) {
  await uploadP12(context);
  await runToResults(context);
}

async function chooseDevice(context: PlayContext) {
  return choose(context, "This device");
}

/** The only usable Windows certificate is chosen without a click. */
async function windowsCertificateSelected(context: PlayContext) {
  const panel = await chooseDevice(context);
  await expect(
    await panel.findByRole("radio", { name: /^Jane Signer/ }, STAGE_TIMEOUT),
  ).toBeChecked();
  return panel;
}

async function chooseUsbToken(context: PlayContext) {
  // The link is disabled while the Windows IDs load as the step opens, so a click
  // before that load settles can land on it disabled and do nothing.
  await windowsCertificateSelected(context);
  await press(context, "Read the card directly");
  const panel = await panelOf(context);
  await panel.findByLabelText("PIN", undefined, STAGE_TIMEOUT);
  return panel;
}

async function listTokenCertificates(context: PlayContext) {
  const panel = await chooseUsbToken(context);
  await userEvent.type(panel.getByLabelText("PIN"), "123456");
  await press(context, "Show digital IDs");
  return panel;
}

export const Panel: Story = {};

export const NoFiles: Story = {
  args: { files: [] },
};

export const CertificateRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};

export const CertificateTooltip: Story = {
  play: openTooltip({ step: "Certificate" }),
};

export const Pkcs12Format: Story = {
  play: async (context) => {
    const panel = await choose(context, "PKCS12");
    await panel.findByRole("button", { name: "Choose PKCS12 File" });
  },
};

export const PfxFormat: Story = {
  play: async (context) => {
    const panel = await choose(context, "PFX");
    await panel.findByRole("button", { name: "Choose PFX File" });
  },
};

export const JksFormat: Story = {
  play: async (context) => {
    const panel = await choose(context, "JKS");
    await panel.findByRole("button", { name: "Choose JKS File" });
  },
};

export const JksUploaded: Story = {
  play: async (context) => {
    await choose(context, "JKS");
    const panel = await uploadToPanel(context, "valid-test.jks");
    await panel.findByLabelText(
      "Certificate Password",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const PemFormat: Story = {
  play: async (context) => {
    await pickPem(context);
  },
};

export const PemPrivateKeyUploaded: Story = {
  play: async (context) => {
    await uploadPemKey(context);
  },
};

export const PemUploaded: Story = {
  play: async (context) => {
    await uploadPemKey(context);
    const panel = await uploadToPanel(context, "valid-test-cert.pem", 1);
    await panel.findByLabelText(
      "Certificate Password",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const Pkcs12Uploaded: Story = {
  play: async (context) => {
    const panel = await uploadP12(context);
    await userEvent.type(panel.getByLabelText("Certificate Password"), "pass");
  },
};

export const SignatureAppearanceTooltip: Story = {
  play: openTooltip({ step: "Signature Appearance" }, { after: uploadP12 }),
};

export const VisibleSignature: Story = {
  play: async (context) => {
    await showVisibleSignature(context);
  },
};

export const VisibleSignatureDetails: Story = {
  play: async (context) => {
    const panel = await showVisibleSignature(context);
    for (const [detail, value] of [
      ["Reason", "Approval"],
      ["Location", "London"],
      ["Signer name", "Jane Signer"],
    ]) {
      await userEvent.click(panel.getByRole("button", { name: detail }));
      await userEvent.type(
        await panel.findByRole("textbox", { name: detail }),
        value,
      );
    }
    const logo = panel.getByRole("switch", { name: "Logo behind signature" });
    await userEvent.click(logo);
    await waitFor(() => expect(logo).not.toBeChecked());
    await expect(panel.getByRole("textbox", { name: "Reason" })).toHaveValue(
      "Approval",
    );
  },
};

export const Signed: Story = {
  parameters: signsSample,
  play: sign,
};

export const UndoTooltip: Story = {
  parameters: signsSample,
  play: openTooltip({ info: "Undo" }, { after: sign }),
};

export const ServerCertificateSource: Story = {
  parameters: toolPanelServer(serverCertificateOnly),
  play: async (context) => {
    const panel = await panelOf(context);
    await panel.findByRole("radio", { name: "Server" }, STAGE_TIMEOUT);
    await expect(
      panel.queryByRole("radio", { name: "This device" }),
    ).toBeNull();
  },
};

export const ServerCertificate: Story = {
  parameters: toolPanelServer(serverCertificateOnly),
  play: async (context) => {
    const panel = await choose(context, "Server");
    await waitFor(() =>
      expect(panel.queryByRole("radio", { name: "PKCS12" })).toBeNull(),
    );
    await panel.findByRole(
      "switch",
      { name: "Show signature on page" },
      STAGE_TIMEOUT,
    );
  },
};

export const CertificateSources: Story = {
  parameters: withDevice(),
  play: async (context) => {
    const panel = await panelOf(context);
    await panel.findByRole("radio", { name: "This device" }, STAGE_TIMEOUT);
  },
};

export const CertificateSourceTooltip: Story = {
  parameters: withDevice(),
  play: openTooltip({ step: "Certificate source" }),
};

export const DeviceCapabilitiesLoading: Story = {
  parameters: withDevice({ capabilitiesResponse: neverAnswers }),
  play: async (context) => {
    const panel = await chooseDevice(context);
    // Mantine's Loader has no role or name, so it is found by its class.
    await waitFor(
      () =>
        expect(
          context.canvasElement.ownerDocument.querySelector(
            '[data-sidebar="tool-panel"] .mantine-Loader-root',
          ),
        ).toBeVisible(),
      STAGE_TIMEOUT,
    );
    await expect(panel.queryByRole("radio", { name: "PKCS12" })).toBeNull();
    await expect(panel.queryByLabelText("PIN")).toBeNull();
    await expect(
      panel.queryByRole("button", { name: "Read the card directly" }),
    ).toBeNull();
  },
};

export const WindowsCertificateStore: Story = {
  parameters: withDevice(),
  play: async (context) => {
    await windowsCertificateSelected(context);
  },
};

export const WindowsCertificatesExpired: Story = {
  parameters: withDevice(),
  play: async (context) => {
    const panel = await windowsCertificateSelected(context);
    await press(context, "Show 2 expired");
    await panel.findByText("Old Signing Key");
    await expect(
      panel.queryByRole("radio", { name: /^Old Signing Key/ }),
    ).toBeNull();
  },
};

export const WindowsCertificatesLoading: Story = {
  parameters: withDevice({ windowsCertificates: neverAnswers }),
  play: async (context) => {
    const panel = await chooseDevice(context);
    await panel.findByText("Digital ID", undefined, STAGE_TIMEOUT);
    await expect(
      panel.queryByRole("radio", { name: /^Jane Signer/ }),
    ).toBeNull();
  },
};

export const WindowsCertificateStoreEmpty: Story = {
  parameters: withDevice({ windowsCertificates: () => HttpResponse.json([]) }),
  play: async (context) => {
    const panel = await chooseDevice(context);
    await panel.findByText(/^No digital IDs found/, undefined, STAGE_TIMEOUT);
  },
};

export const WindowsCertificateStoreError: Story = {
  parameters: withDevice({
    windowsCertificates: hardwareError("Access to the store was denied"),
  }),
  play: async (context) => {
    const panel = await chooseDevice(context);
    await panel.findByText(
      "Access to the store was denied",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const UsbToken: Story = {
  parameters: withDevice(),
  play: async (context) => {
    const panel = await chooseUsbToken(context);
    await panel.findByText(OPENSC.path, undefined, STAGE_TIMEOUT);
  },
};

export const UsbTokenDriverMenu: Story = {
  parameters: withDevice(),
  play: async (context) => {
    await chooseUsbToken(context);
    const menu = await openSelect(context, "Card software (PKCS#11)");
    await menu.findByRole("option", { name: "Other location…" });
  },
};

export const UsbTokenCustomDriver: Story = {
  parameters: withDevice(),
  play: async (context) => {
    await chooseUsbToken(context);
    const menu = await openSelect(context, "Card software (PKCS#11)");
    await userEvent.click(
      menu.getByRole("option", { name: "Other location…" }),
    );
    const panel = await panelOf(context);
    await userEvent.type(
      await panel.findByLabelText("Card software path"),
      "/opt/token/libpkcs11.so",
    );
  },
};

export const UsbTokenCertificates: Story = {
  parameters: withDevice(),
  play: async (context) => {
    const panel = await chooseUsbToken(context);
    await userEvent.type(panel.getByLabelText("PIN"), "123456");
    await userEvent.type(panel.getByLabelText("Slot (optional)"), "0");
    await press(context, "Show digital IDs");
    await panel.findByRole(
      "radio",
      { name: /^Jane Signer \(token\)/ },
      STAGE_TIMEOUT,
    );
  },
};

export const UsbTokenCertificateChosen: Story = {
  parameters: withDevice(),
  play: async (context) => {
    const panel = await listTokenCertificates(context);
    await userEvent.click(
      await panel.findByRole(
        "radio",
        { name: /^Jane Signer \(token\)/ },
        STAGE_TIMEOUT,
      ),
    );
    await panel.findByRole(
      "switch",
      { name: "Show signature on page" },
      STAGE_TIMEOUT,
    );
  },
};

export const UsbTokenListError: Story = {
  parameters: withDevice({
    tokenCertificates: hardwareError("CKR_PIN_INCORRECT"),
  }),
  play: async (context) => {
    const panel = await listTokenCertificates(context);
    await panel.findByText("CKR_PIN_INCORRECT", undefined, STAGE_TIMEOUT);
  },
};

export const UsbTokenNoDriverDetected: Story = {
  parameters: withDevice({ detectedLibraries: [] }),
  play: async (context) => {
    const panel = await chooseUsbToken(context);
    await panel.findByText(/^No card software was detected/);
  },
};

export const DeviceWithoutWindowsStore: Story = {
  parameters: withDevice({ windowsStoreSupported: false }),
  play: async (context) => {
    const panel = await chooseDevice(context);
    await panel.findByLabelText("PIN", undefined, STAGE_TIMEOUT);
    await expect(
      panel.queryByRole("button", { name: "Back to digital IDs" }),
    ).toBeNull();
  },
};
