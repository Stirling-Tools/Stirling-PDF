import type { Meta, StoryObj } from "@storybook/react-vite";
import AdminAuditSection from "@editor/components/shared/config/configSections/AdminAuditSection";
import { AppConfigProvider } from "@editor/contexts/AppConfigContext";
import auditService from "@editor/services/auditService";

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
 * The dashboard's stat cards, charts and events table each fetch on mount,
 * and an unmocked read comes back in a shape they crash on.
 */
function stubDashboardReads() {
  auditService.getStats = async () => ({
    totalEvents: 15234,
    prevTotalEvents: 13870,
    uniqueUsers: 42,
    prevUniqueUsers: 38,
    successRate: 98.4,
    prevSuccessRate: 97.9,
    avgLatencyMs: 220,
    prevAvgLatencyMs: 245,
    errorCount: 31,
    topEventType: "PDF_PROCESS",
    topUser: "admin",
    eventsByType: { PDF_PROCESS: 11020, USER_LOGIN: 3104, USER_LOGOUT: 1110 },
    eventsByUser: { admin: 6120, editor: 9114 },
    topTools: { compress: 4210, merge: 3302, split: 2108 },
    hourlyDistribution: { "09": 1820, "12": 2440, "15": 2105 },
  });
  auditService.getChartsData = async () => ({
    eventsByType: {
      labels: ["PDF_PROCESS", "USER_LOGIN", "USER_LOGOUT"],
      values: [11020, 3104, 1110],
    },
    eventsByUser: { labels: ["admin", "editor"], values: [6120, 9114] },
    eventsOverTime: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      values: [2810, 3122, 2990, 3305, 3007],
    },
  });
  auditService.getEvents = async () => ({
    events: [
      {
        id: "1",
        timestamp: "2026-11-24T09:12:00Z",
        eventType: "PDF_PROCESS",
        username: "editor",
        ipAddress: "10.0.0.12",
        details: { tool: "compress" },
      },
      {
        id: "2",
        timestamp: "2026-11-24T08:47:00Z",
        eventType: "USER_LOGIN",
        username: "admin",
        ipAddress: "10.0.0.4",
        details: {},
      },
    ],
    totalEvents: 2,
    page: 0,
    pageSize: 20,
    totalPages: 1,
  });
  auditService.getEventTypes = async () => [
    "PDF_PROCESS",
    "USER_LOGIN",
    "USER_LOGOUT",
  ];
  auditService.getUsers = async () => ["admin", "editor"];
}

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
      stubDashboardReads();
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
      stubDashboardReads();
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
