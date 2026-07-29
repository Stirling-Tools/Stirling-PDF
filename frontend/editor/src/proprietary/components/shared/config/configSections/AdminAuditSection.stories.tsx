import type { Meta, StoryObj } from "@storybook/react-vite";
import AdminAuditSection from "@app/components/shared/config/configSections/AdminAuditSection";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import auditService from "@app/services/auditService";

// AdminAuditSection reads its config through useAppConfig()/useLoginRequired()
// rather than taking props, so each variant wraps it in an AppConfigProvider
// with a fixed initialConfig (autoFetch off, so stories never hit the API).
// Without login enabled + an ENTERPRISE license the component falls back to
// hardcoded demo data on its own; the "fully enabled" and "disabled" variants
// below supply that config, which makes the component call
// auditService.getSystemStatus() on mount, so each stubs that call directly
// (the module exports a plain object, the seam the component itself calls
// through) inside its own decorator so the two variants don't depend on
// render order.
const meta = {
  title: "Config/AdminAuditSection",
  component: AdminAuditSection,
} satisfies Meta<typeof AdminAuditSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * No login configured yet: falls back to demo data, shows the enterprise
 * banner, and the dashboard tabs are disabled.
 */
export const Default: Story = {};

/** Login is disabled entirely: both the login and enterprise banners show. */
export const LoginDisabled: Story = {
  decorators: [
    (Story) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{ enableLogin: false }}
      >
        <Story />
      </AppConfigProvider>
    ),
  ],
};

/**
 * Login enabled with an ENTERPRISE license: both banners are hidden, the
 * dashboard tabs are active, and the fetched (mocked) status backs the page
 * instead of the built-in demo data.
 */
export const Enabled: Story = {
  decorators: [
    (Story) => {
      auditService.getSystemStatus = async () => ({
        enabled: true,
        level: "INFO",
        retentionDays: 90,
        totalEvents: 15234,
        pdfMetadataEnabled: true,
        captureFileHash: true,
        capturePdfAuthor: true,
        captureOperationResults: true,
      });
      return (
        <AppConfigProvider
          autoFetch={false}
          bootstrapMode="non-blocking"
          initialConfig={{ enableLogin: true, license: "ENTERPRISE" }}
        >
          <Story />
        </AppConfigProvider>
      );
    },
  ],
};

/** Audit logging itself is turned off server-side: shows the disabled notice instead of the tabs. */
export const AuditLoggingDisabled: Story = {
  decorators: [
    (Story) => {
      auditService.getSystemStatus = async () => ({
        enabled: false,
        level: "OFF",
        retentionDays: 0,
        totalEvents: 0,
        pdfMetadataEnabled: false,
        captureFileHash: false,
        capturePdfAuthor: false,
        captureOperationResults: false,
      });
      return (
        <AppConfigProvider
          autoFetch={false}
          bootstrapMode="non-blocking"
          initialConfig={{ enableLogin: true, license: "ENTERPRISE" }}
        >
          <Story />
        </AppConfigProvider>
      );
    },
  ],
};
