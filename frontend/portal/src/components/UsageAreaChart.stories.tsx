import type { Meta, StoryObj } from "@storybook/react-vite";
import { UsageAreaChart } from "@portal/components/UsageAreaChart";
import { buildUsageSeries } from "@portal/mocks/home";

const meta: Meta<typeof UsageAreaChart> = {
  title: "Portal/Home/UsageAreaChart",
  component: UsageAreaChart,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "60rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof UsageAreaChart>;

const series = buildUsageSeries();
const total = series.reduce((sum, p) => sum + p.value, 0);

export const Default: Story = {
  args: { data: series, totalValue: total.toLocaleString(), deltaPct: 0.12 },
};

export const NegativeDelta: Story = {
  args: { data: series, totalValue: total.toLocaleString(), deltaPct: -0.08 },
};

export const NoDelta: Story = {
  args: { data: series },
};

export const Flat: Story = {
  args: {
    data: series.map((p) => ({ ...p, value: 1200 })),
    totalValue: "36,000",
  },
};

export const HighVolatility: Story = {
  args: {
    data: series.map((p, i) => ({
      ...p,
      value: Math.round(p.value * (1 + Math.sin(i) * 0.6)),
    })),
  },
};

export const Empty: Story = {
  args: { data: [], totalValue: "—" },
};
