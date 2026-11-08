import type { Meta, StoryObj } from "@storybook/react-vite";
import { LicensePanel } from "@processor/components/procurement/ProcurementStages";
import "@processor/views/Procurement.css";

/** The licence key panel on the Enterprise page, with and without the offline licence file. */
const meta: Meta = {
  title: "Portal/Procurement/ProcurementStages",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj;

// Licence key with the offline add-on available.
export const License: Story = {
  render: () => (
    <LicensePanel
      licenseKey="MOCK-ENTERPRISE-KEY-0001"
      offlineAvailable
      downloadingLicense={false}
      onDownloadOffline={() => {}}
    />
  ),
};

// Offline add-on not purchased: only the copy action is offered.
export const LicenseOnlineOnly: Story = {
  render: () => (
    <LicensePanel
      licenseKey="MOCK-ENTERPRISE-KEY-0001"
      offlineAvailable={false}
      downloadingLicense={false}
      onDownloadOffline={() => {}}
    />
  ),
};

// Offline licence file is being generated.
export const LicenseDownloading: Story = {
  render: () => (
    <LicensePanel
      licenseKey="MOCK-ENTERPRISE-KEY-0001"
      offlineAvailable
      downloadingLicense
      onDownloadOffline={() => {}}
    />
  ),
};
