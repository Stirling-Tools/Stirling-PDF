import type { Meta, StoryObj } from "@storybook/react-vite";
import AdminAuditSection from "@app/components/shared/config/configSections/AdminAuditSection";

/**
 * Admin settings page for audit logging: system status, dashboard/events/export/clear-data
 * tabs. Takes no props — without a real login/enterprise config it falls back to demo data
 * so the page has something to show.
 */
const meta = {
  title: "Config/AdminAuditSection",
  component: AdminAuditSection,
} satisfies Meta<typeof AdminAuditSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
