import type { Meta, StoryObj } from "@storybook/react-vite";
import UsageAnalyticsChart from "@app/components/shared/config/configSections/usage/UsageAnalyticsChart";

/**
 * Bar chart summarising endpoint usage counts.
 */
const meta: Meta<typeof UsageAnalyticsChart> = {
  title: "Config/Usage/UsageAnalyticsChart",
  component: UsageAnalyticsChart,
  parameters: { layout: "padded" },
  args: {
    data: [
      { label: "/api/v1/pdf/merge", value: 482 },
      { label: "/api/v1/pdf/split", value: 317 },
      { label: "/api/v1/pdf/compress", value: 210 },
      { label: "/api/v1/pdf/convert-to-pdf", value: 96 },
    ],
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No usage data yet available. */
export const Empty: Story = {
  args: { data: [] },
};
