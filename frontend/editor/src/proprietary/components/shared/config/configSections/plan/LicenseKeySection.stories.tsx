import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent } from "storybook/test";
import LicenseKeySection from "@app/components/shared/config/configSections/plan/LicenseKeySection";
import type { LicenseInfo } from "@app/services/licenseService";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { LicenseProvider } from "@app/contexts/LicenseContext";

/**
 * The collapsible panel at the foot of the plan page for activating a licence
 * bought outside the in-app checkout, either as a key string or a certificate
 * file.
 *
 * Everything below the toggle lives behind local state — the collapse itself and
 * the key/file choice — so the interesting states are only reachable by driving
 * the control rather than by setting a prop. Each story below opens the panel
 * first for that reason. The toggle is the only button while collapsed, so it is
 * found by role without depending on the translated copy.
 *
 * A licence already installed adds two alerts above the form: an overwrite
 * warning and a summary of what is currently active, which reads differently for
 * a key than for a file path.
 *
 * useLicense() throws outside a provider. LicenseProvider is mounted with a
 * non-admin config so it settles without issuing a licence request of its own.
 */
function withLicenseContext(enableLogin: boolean) {
  return function Decorator(Story: () => React.JSX.Element) {
    return (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{ enableLogin }}
      >
        <LicenseProvider>
          <Story />
        </LicenseProvider>
      </AppConfigProvider>
    );
  };
}

async function openPanel(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button"));
}

const keyLicence: LicenseInfo = {
  licenseType: "SERVER",
  enabled: true,
  maxUsers: 0,
  hasKey: true,
  licenseKey: "STORY-LICENCE-0000-0000-0000",
};

const fileLicence: LicenseInfo = {
  licenseType: "ENTERPRISE",
  enabled: true,
  maxUsers: 250,
  hasKey: true,
  licenseKey: "file:/opt/stirling/licence.cert",
};

const meta = {
  title: "Config/Plan/LicenseKeySection",
  component: LicenseKeySection,
  parameters: { layout: "padded" },
  decorators: [withLicenseContext(true)],
} satisfies Meta<typeof LicenseKeySection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Closed, which is how the panel first appears beneath the plan cards. */
export const Collapsed: Story = {};

/** Opened with no licence installed: just the explanatory alert and the key field. */
export const Expanded: Story = {
  play: ({ canvasElement }) => openPanel(canvasElement),
};

/** The certificate-file alternative, which swaps the key field for a file picker. */
export const CertificateFileUpload: Story = {
  play: async ({ canvasElement }) => {
    await openPanel(canvasElement);
    const canvas = within(canvasElement);
    // The key/file choice is a radiogroup; the second option is the file upload.
    await userEvent.click(canvas.getAllByRole("radio")[1]);
  },
};

/** A key licence is already active: the overwrite warning and the active-licence summary appear. */
export const ExistingKeyLicence: Story = {
  args: { currentLicenseInfo: keyLicence },
  play: ({ canvasElement }) => openPanel(canvasElement),
};

/** The active licence came from a certificate file, so its summary names the path instead. */
export const ExistingFileLicence: Story = {
  args: { currentLicenseInfo: fileLicence },
  play: ({ canvasElement }) => openPanel(canvasElement),
};

/** Login mode disabled: the panel still opens but every input and the save action are locked. */
export const LoginDisabled: Story = {
  decorators: [withLicenseContext(false)],
  play: ({ canvasElement }) => openPanel(canvasElement),
};
