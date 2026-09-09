import type { Meta, StoryObj } from "@storybook/react-vite";
import UsageAnalyticsTable from "@app/components/shared/config/configSections/usage/UsageAnalyticsTable";
import type { EndpointStatistic } from "@app/services/usageAnalyticsService";

const ENDPOINTS: EndpointStatistic[] = [
  { endpoint: "/api/v1/general/merge-pdfs", visits: 1284, percentage: 34.12 },
  {
    endpoint: "/api/v1/security/remove-password",
    visits: 842,
    percentage: 22.36,
  },
  { endpoint: "/api/v1/convert/pdf-to-word", visits: 601, percentage: 15.97 },
  { endpoint: "/api/v1/misc/compress-pdf", visits: 388, percentage: 10.31 },
];

const meta = {
  title: "Config/Usage/UsageAnalyticsTable",
  component: UsageAnalyticsTable,
  parameters: { layout: "padded" },
  args: {
    data: ENDPOINTS,
  },
} satisfies Meta<typeof UsageAnalyticsTable>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No usage recorded yet renders an empty-state row instead of the table body. */
export const Empty: Story = {
  args: { data: [] },
};
