import type { Meta, StoryObj } from "@storybook/react-vite";
import AuditStatsCards from "@app/components/shared/config/configSections/audit/AuditStatsCards";

/**
 * Stat cards summarising audit log activity (events, success rate, active
 * users, latency) for a given time period. With `loginEnabled={false}` it
 * renders built-in demo data instead of calling the audit API.
 */
const meta: Meta<typeof AuditStatsCards> = {
  title: "Config/Audit/AuditStatsCards",
  component: AuditStatsCards,
  parameters: { layout: "padded" },
  args: {
    loginEnabled: false,
    timePeriod: "week",
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Stats for a single day period. */
export const Day: Story = {
  args: { timePeriod: "day" },
};

/** Stats for a full month period. */
export const Month: Story = {
  args: { timePeriod: "month" },
};
