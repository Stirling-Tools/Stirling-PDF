import type { Meta, StoryObj } from "@storybook/react-vite";
import AuditChartsSection from "@app/components/shared/config/configSections/audit/AuditChartsSection";

/**
 * Dashboard of audit-log charts (events over time, by type, by user).
 * When `loginEnabled` is false it renders deterministic demo data instead
 * of calling the audit API, which is what these stories rely on.
 */
const meta: Meta<typeof AuditChartsSection> = {
  title: "Config/AuditChartsSection",
  component: AuditChartsSection,
  parameters: { layout: "padded" },
  args: {
    loginEnabled: false,
    timePeriod: "week",
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Day view of the same demo dataset. */
export const DayPeriod: Story = {
  args: { timePeriod: "day" },
};
