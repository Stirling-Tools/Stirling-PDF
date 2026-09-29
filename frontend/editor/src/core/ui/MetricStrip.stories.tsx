import type { Meta, StoryObj } from "@storybook/react-vite";
import { MetricStrip } from "@app/ui/MetricStrip";
import { MetricCard } from "@app/ui/MetricCard";

function ShieldIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
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
