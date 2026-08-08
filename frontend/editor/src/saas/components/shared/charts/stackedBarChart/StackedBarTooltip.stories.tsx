/**
 * The hover card on the SaaS usage chart. Each row is a fraction of a quota,
 * with its own colour taken from the series it belongs to.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import StackedBarTooltip from "@app/components/shared/charts/stackedBarChart/StackedBarTooltip";
import type { FractionData } from "@app/types/charts";

function fraction(
  name: string,
  numerator: number,
  denominator: number,
  color: string,
): FractionData {
  return {
    name,
    numerator,
    denominator,
    numeratorLabel: `${numerator}`,
    denominatorLabel: `${denominator}`,
    color,
  };
}

const meta: Meta<typeof StackedBarTooltip> = {
  title: "SaaS/Charts/StackedBarTooltip",
  component: StackedBarTooltip,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof StackedBarTooltip>;

export const Default: Story = {
  args: {
    data: {
      fractions: [
        fraction("Documents", 812, 2000, "#3b82f6"),
        fraction("Pages", 4310, 20000, "#22c55e"),
      ],
    },
  },
};

/** One series only, which is the free-plan shape. */
export const SingleSeries: Story = {
  args: { data: { fractions: [fraction("Documents", 45, 50, "#f59e0b")] } },
};

/** A quota already spent, where the numbers meet. */
export const AtLimit: Story = {
  args: { data: { fractions: [fraction("Documents", 2000, 2000, "#ef4444")] } },
};

/** Several series, where the card has to stay readable as it grows. */
export const ManySeries: Story = {
  args: {
    data: {
      fractions: [
        fraction("Documents", 812, 2000, "#3b82f6"),
        fraction("Pages", 4310, 20000, "#22c55e"),
        fraction("OCR minutes", 96, 300, "#a855f7"),
        fraction("Storage (MB)", 1450, 5000, "#f59e0b"),
      ],
    },
  },
};

/** Nothing used yet. */
export const Empty: Story = {
  args: { data: { fractions: [fraction("Documents", 0, 2000, "#3b82f6")] } },
};
