/**
 * The usage chart on the SaaS billing screens. Each fraction is one quota
 * drawn as a filled proportion of its total, with a legend beneath.
 *
 * The bars are drawn with D3 into an SVG on mount, so the animation is turned
 * off here — an in-flight transition makes a captured panel arbitrary.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import StackedBarChart from "@app/components/shared/charts/StackedBarChart";
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

const USAGE = [
  fraction("Documents", 812, 2000, "#3b82f6"),
  fraction("Pages", 4310, 20000, "#22c55e"),
  fraction("OCR minutes", 96, 300, "#a855f7"),
];

const meta: Meta<typeof StackedBarChart> = {
  title: "SaaS/Charts/StackedBarChart",
  component: StackedBarChart,
  parameters: { layout: "padded" },
  args: {
    fractions: USAGE,
    animate: false,
    ariaLabel: "Usage against plan limits",
  },
};
export default meta;

type Story = StoryObj<typeof StackedBarChart>;

export const Default: Story = {};

export const WithoutLegend: Story = { args: { showLegend: false } };

/** Waiting on the usage figures. */
export const Loading: Story = { args: { loading: true } };

/** A quota fully spent, where the bar reaches its end. */
export const AtLimit: Story = {
  args: { fractions: [fraction("Documents", 2000, 2000, "#ef4444")] },
};

/** Nothing used yet, so every bar is empty. */
export const Unused: Story = {
  args: {
    fractions: USAGE.map((f) => ({ ...f, numerator: 0, numeratorLabel: "0" })),
  },
};

/** One series only, which is the free-plan shape. */
export const SingleSeries: Story = { args: { fractions: [USAGE[0]] } };

/** A short, wide frame, where the labels have least room. */
export const Compact: Story = { args: { height: 120, width: 320 } };
