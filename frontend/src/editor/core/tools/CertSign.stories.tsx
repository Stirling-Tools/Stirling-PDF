import type { StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  appConfig,
  fixtureResponse,
  knownA11yIssues,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
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
  osName: windowsStoreSupported ? "Windows 11" : "Mac OS X",
  windowsStoreSupported,
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

/**
 * The server's own error message. The desktop app's HTTP client hands the
 * error body on as an unparsed string, which the panel cannot read the message
 * from.
 */
const SHOWS_SERVER_ERROR = ["broken-in-desktop"];

async function press(context: PlayContext, name: string) {
  await userEvent.click(await findEnabled(context, "button", name));
  return panelOf(context);
}

async function uploadP12(context: PlayContext) {
  await choose(context, "PKCS12");
  const panel = await uploadToPanel(context, "valid-test.p12");
  await panel.findByLabelText("Certificate Password", undefined, STAGE_TIMEOUT);
  await panel.findByRole("radio", { name: "Visible" }, STAGE_TIMEOUT);
  return panel;
}

async function showVisibleSignature(context: PlayContext) {
  await uploadP12(context);
  const panel = await choose(context, "Visible");
  await panel.findByText("Signature Details", undefined, STAGE_TIMEOUT);
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

async function windowsCertificateSelected(context: PlayContext) {
  const panel = await chooseDevice(context);
  await panel.findByDisplayValue(
    "Jane Signer · Example Issuing CA (expires 2028-01-01)",
    undefined,
    STAGE_TIMEOUT,
  );
  return panel;
}

async function chooseUsbToken(context: PlayContext) {
  await chooseDevice(context);
  const panel = await choose(context, "USB Token");
  await panel.findByLabelText("Token PIN", undefined, STAGE_TIMEOUT);
  return panel;
}

async function listTokenCertificates(context: PlayContext) {
  const panel = await chooseUsbToken(context);
  await userEvent.type(panel.getByLabelText("Token PIN"), "123456");
  await press(context, "List certificates");
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
    await userEvent.type(panel.getByLabelText("Reason"), "Approval");
    await userEvent.type(panel.getByLabelText("Location"), "London");
    await userEvent.type(panel.getByLabelText("Name"), "Jane Signer");
    const page = panel.getByLabelText("Page Number");
    await userEvent.clear(page);
    await userEvent.type(page, "2");
    await choose(context, "No Logo");
    await waitFor(() => expect(page).toHaveValue("2"));
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
    await panel.findByRole("radio", { name: "Visible" }, STAGE_TIMEOUT);
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
    await expect(panel.queryByLabelText("Token PIN")).toBeNull();
    await expect(panel.queryByRole("radio", { name: "USB Token" })).toBeNull();
  },
};

export const WindowsCertificateStore: Story = {
  parameters: withDevice(),
  play: async (context) => {
    await windowsCertificateSelected(context);
  },
};

export const WindowsCertificateMenu: Story = {
  parameters: {
    ...withDevice(),
    // Certificate labels are wider than the listbox, which then scrolls
    // sideways with nothing in it that takes focus.
    ...knownA11yIssues("scrollable-region-focusable"),
  },
  play: async (context) => {
    await windowsCertificateSelected(context);
    const menu = await openSelect(context, "Certificate");
    await expect(
      menu.getByRole("option", { name: /^Old Signing Key/ }),
    ).toHaveAttribute("data-combobox-disabled", "true");
  },
};

export const WindowsCertificatesLoading: Story = {
  parameters: withDevice({ windowsCertificates: neverAnswers }),
  play: async (context) => {
    const panel = await chooseDevice(context);
    await panel.findByText("Reading certificates…", undefined, STAGE_TIMEOUT);
  },
};

export const WindowsCertificateStoreEmpty: Story = {
  parameters: {
    ...withDevice({ windowsCertificates: () => HttpResponse.json([]) }),
    // The empty Select still draws a listbox, holding only its message.
    ...knownA11yIssues("aria-required-children"),
  },
  play: async (context) => {
    await chooseDevice(context);
    await openSelect(context, "Certificate");
    await bodyOf(context).findByText(
      "No signing certificates found",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const WindowsCertificateStoreError: Story = {
  tags: SHOWS_SERVER_ERROR,
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
    const menu = await openSelect(context, "PKCS#11 driver");
    await menu.findByRole("option", { name: "Custom driver path…" });
  },
};

export const UsbTokenCustomDriver: Story = {
  parameters: withDevice(),
  play: async (context) => {
    await chooseUsbToken(context);
    const menu = await openSelect(context, "PKCS#11 driver");
    await userEvent.click(
      menu.getByRole("option", { name: "Custom driver path…" }),
    );
    const panel = await panelOf(context);
    await userEvent.type(
      await panel.findByLabelText("Driver library path"),
      "/opt/token/libpkcs11.so",
    );
  },
};

export const UsbTokenCertificates: Story = {
  parameters: withDevice(),
  play: async (context) => {
    const panel = await listTokenCertificates(context);
    await userEvent.type(panel.getByLabelText("Slot (optional)"), "0");
    await panel.findByPlaceholderText(
      "Select certificate",
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const UsbTokenCertificateMenu: Story = {
  parameters: withDevice(),
  play: async (context) => {
    await listTokenCertificates(context);
    const menu = await openSelect(context, "Certificate");
    await userEvent.click(
      menu.getByRole("option", { name: /^Jane Signer \(token\)/ }),
    );
    const panel = await panelOf(context);
    await panel.findByRole("radio", { name: "Visible" }, STAGE_TIMEOUT);
  },
};

export const UsbTokenListError: Story = {
  tags: SHOWS_SERVER_ERROR,
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
    await panel.findByText(/^No PKCS#11 driver was detected/);
  },
};

export const DeviceWithoutWindowsStore: Story = {
  parameters: withDevice({ windowsStoreSupported: false }),
  play: async (context) => {
    const panel = await chooseDevice(context);
    await panel.findByLabelText("Token PIN", undefined, STAGE_TIMEOUT);
    await expect(panel.queryByRole("radio", { name: "USB Token" })).toBeNull();
  },
};
