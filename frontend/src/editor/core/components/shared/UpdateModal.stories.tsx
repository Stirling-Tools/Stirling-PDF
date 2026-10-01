import type { Meta, StoryObj } from "@storybook/react-vite";
import UpdateModal from "@app/components/shared/UpdateModal";
import type { UpdateSummary, MachineInfo } from "@app/services/updateService";

const UPDATE_SUMMARY: UpdateSummary = {
  latest_version: "2.5.0",
  latest_stable_version: "2.5.0",
  max_priority: "normal",
  recommended_action: "This update contains important fixes and improvements.",
  any_breaking: false,
  migration_guides: [
    {
      version: "2.5.0",
      notes: "Config file format changed for custom watermark presets.",
      url: "https://docs.stirlingpdf.com/migration/2.5.0",
    },
  ],
};

const MACHINE_INFO: MachineInfo = {
  machineType: "Client-win",
  activeSecurity: false,
  licenseType: "NORMAL",
};

const meta = {
  title: "Shared/UpdateModal",
  component: UpdateModal,
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    onClose: () => {},
    currentVersion: "2.4.0",
    updateSummary: UPDATE_SUMMARY,
    machineInfo: MACHINE_INFO,
    downloadSizeBytes: 235_000_000,
  },
} satisfies Meta<typeof UpdateModal>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Web/server build: no Tauri updater, so the footer offers a plain download link. */
export const Default: Story = {};

/** Desktop app: an update has finished installing and is waiting for a restart. */
export const DesktopInstallReadyToRestart: Story = {
  args: {
    desktopInstall: {
      state: "ready-to-restart",
      progress: null,
      errorMessage: null,
      actions: {
        startInstall: async () => true,
        restartApp: async () => {},
      },
    },
  },
};

/** Desktop app on a non-admin machine: install probe reported it can't write to
 * the install directory, so Install Now is disabled and the docs alert shows. */
export const DesktopInstallBlocked: Story = {
  args: {
    desktopInstall: {
      state: "idle",
      progress: null,
      errorMessage: null,
      actions: {
        startInstall: async () => true,
        restartApp: async () => {},
      },
      canInstall: {
        canInstall: false,
        reason: "Install directory is not writable without elevation.",
      },
    },
  },
};
