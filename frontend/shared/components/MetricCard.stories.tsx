import type { Meta, StoryObj } from "@storybook/react-vite";
import { MetricCard } from "@shared/components/MetricCard";

const meta: Meta<typeof MetricCard> = {
  title: "Primitives/MetricCard",
  component: MetricCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    label: "Docs / 24h",
    value: "2,481",
    delta: 0.07,
    emphasis: "default",
  },
  argTypes: {
    emphasis: { control: "inline-radio", options: ["default", "primary"] },
    deltaDirection: {
      control: "inline-radio",
      options: ["up", "down", "flat", undefined],
    },
    delta: { control: { type: "number", step: 0.01 } },
  },
  decorators: [
    (S) => (
      <div style={{ width: "16rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof MetricCard>;

/** Flip value / delta / description / emphasis in controls. */
export const Playground: Story = {};

export const ProTierStrip: Story = {
  decorators: [
    (S) => (
      <div style={{ width: "100%" }}>
        <S />
      </div>
    ),
  ],
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
      }}
    >
      <MetricCard label="Docs / 30d" value="76,318" delta={0.12} />
      <MetricCard label="Pipelines" value={12} delta={0.16} />
      <MetricCard label="Agents active" value={7} delta={0.4} />
      <MetricCard label="Eval pass rate" value="94.6%" delta={0.02} />
    </div>
  ),
};

export const FreeTierStrip: Story = {
  decorators: [
    (S) => (
      <div style={{ width: "100%" }}>
        <S />
      </div>
    ),
  ],
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
      }}
    >
      <MetricCard
        label="Docs processed"
        value="247 / 500"
        description="Free plan cap"
      />
      <MetricCard label="Operations" value={189} />
      <MetricCard label="Pipelines" value={3} />
      <MetricCard label="Agents" value={1} />
    </div>
  ),
};
