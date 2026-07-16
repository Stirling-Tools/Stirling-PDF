import type { Meta, StoryObj } from "@storybook/react-vite";
import AuditSystemStatus from "@app/components/shared/config/configSections/audit/AuditSystemStatus";
import type { AuditSystemStatus as AuditStatus } from "@app/services/auditService";

const meta = {
  title: "Config/Audit/AuditSystemStatus",
  component: AuditSystemStatus,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AuditSystemStatus>;
export default meta;
type Story = StoryObj<typeof meta>;

const baseStatus: AuditStatus = {
  enabled: true,
  level: "STANDARD",
  retentionDays: 90,
  totalEvents: 12483,
  pdfMetadataEnabled: true,
  captureFileHash: true,
  capturePdfAuthor: true,
  captureOperationResults: true,
};

export const Default: Story = {
  args: {
    status: baseStatus,
  },
};

/** Audit logging disabled, and the opt-in fields not yet enabled in settings. */
export const Disabled: Story = {
  args: {
    status: {
      ...baseStatus,
      enabled: false,
      totalEvents: 0,
      capturePdfAuthor: false,
      captureFileHash: false,
    },
  },
};
