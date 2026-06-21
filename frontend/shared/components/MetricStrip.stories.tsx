import type { Meta, StoryObj } from "@storybook/react-vite";
import { MetricStrip } from "@shared/components/MetricStrip";
import { MetricCard } from "@shared/components/MetricCard";

const meta: Meta<typeof MetricStrip> = {
  title: "Layout/MetricStrip",
  component: MetricStrip,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof MetricStrip>;

/** Four-up KPI row; collapses to two columns below 50rem. */
export const Default: Story = {
  render: () => (
    <MetricStrip>
      <MetricCard label="Docs / 30d" value="48,210" delta={0.12} />
      <MetricCard label="Pipelines" value="12" delta={0.16} />
      <MetricCard label="Agents active" value="7" delta={0.4} />
      <MetricCard label="Eval pass rate" value="94.6%" delta={0.02} />
    </MetricStrip>
  ),
};
