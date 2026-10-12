import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "@app/ui/Icon";
import { MetricStrip } from "@app/ui/MetricStrip";
import { MetricCard } from "@app/ui/MetricCard";

function ShieldIcon() {
  return <Icon name="shield-check" size={22} />;
}

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

export const Row: Story = {
  render: () => (
    <MetricStrip layout="row" leading={<ShieldIcon />}>
      <MetricCard
        label="Active policies"
        value="2"
        description="Enforcing on upload/export"
      />
      <MetricCard
        label="Paused"
        value="0"
        description="Configured but not firing"
      />
      <MetricCard
        label="Categories"
        value="6"
        description="Available to configure"
      />
      <MetricCard
        label="Docs enforced"
        value="0"
        description="Across active policies"
      />
    </MetricStrip>
  ),
};
