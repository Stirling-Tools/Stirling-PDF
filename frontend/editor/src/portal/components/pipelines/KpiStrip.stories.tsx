import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PipelinesOverviewResponse } from "@portal/api/pipelines";
import { KpiStrip } from "@portal/components/pipelines/KpiStrip";

const overview = (kpis: PipelinesOverviewResponse["kpis"]) =>
  ({ kpis, pipelines: [] }) satisfies PipelinesOverviewResponse;

/** Headline pipeline metrics. The strip always draws its full set of cards —
 *  a missing or still-loading value shows an em dash rather than collapsing,
 *  so the row doesn't reflow as data arrives. */
const meta: Meta<typeof KpiStrip> = {
  title: "Portal/Pipelines/KpiStrip",
  component: KpiStrip,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof KpiStrip>;

/** Populated. */
export const Default: Story = {
  args: {
    loading: false,
    data: overview([
      { value: 12, description: "across 3 sources" },
      { value: 1_284, description: "in the last 24h" },
      { value: 7, description: "awaiting review" },
      { value: 2, description: "failed today" },
    ]),
  },
};

/** Still fetching — every card shows its placeholder. */
export const Loading: Story = {
  args: { loading: true, data: null },
};

/** Fetch finished with nothing to show. */
export const NoData: Story = {
  args: { loading: false, data: null },
};

/** Fewer KPIs than cards: the trailing cards fall back to the em dash instead
 *  of rendering empty. */
export const PartialData: Story = {
  args: {
    loading: false,
    data: overview([{ value: 3, description: "across 1 source" }]),
  },
};

/** Large values, to check the numerals stay on one line. */
export const HighVolume: Story = {
  args: {
    loading: false,
    data: overview([
      { value: 480, description: "across 26 sources" },
      { value: 1_940_233, description: "in the last 24h" },
      { value: 12_004, description: "awaiting review" },
      { value: 631, description: "failed today" },
    ]),
  },
};
