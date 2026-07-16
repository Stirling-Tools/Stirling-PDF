import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  PaymentStageCard,
  LiveStageCard,
  LicensePanel,
} from "@portal/components/procurement/ProcurementStages";
import "@portal/views/Procurement.css";

/**
 * The three small presentational pieces used inside the procurement takeover
 * modal once a quote exists: the payment step, the live confirmation, and the
 * licence panel shown alongside them. Grouped in one story file since none is
 * substantial enough to warrant its own.
 */
const meta: Meta = {
  title: "Portal/Procurement/ProcurementStages",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj;

// Subscription created: both invoice link and PDF download are offered.
export const Payment: Story = {
  render: () => (
    <PaymentStageCard
      invoiceUrl="https://billing.example.com/invoices/inv_123"
      invoicePdf="https://billing.example.com/invoices/inv_123.pdf"
    />
  ),
};

// Invoice not yet issued: no action row renders.
export const PaymentPending: Story = {
  render: () => <PaymentStageCard invoiceUrl={null} invoicePdf={null} />,
};

// Deal is active: terminal confirmation card.
export const Live: Story = {
  render: () => <LiveStageCard />,
};

// Licence key with the offline add-on available.
export const License: Story = {
  render: () => (
    <LicensePanel
      licenseKey="STIRLING-ENT-8F2C-9K1M-3XQ7"
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
      licenseKey="STIRLING-ENT-8F2C-9K1M-3XQ7"
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
      licenseKey="STIRLING-ENT-8F2C-9K1M-3XQ7"
      offlineAvailable
      downloadingLicense
      onDownloadOffline={() => {}}
    />
  ),
};
