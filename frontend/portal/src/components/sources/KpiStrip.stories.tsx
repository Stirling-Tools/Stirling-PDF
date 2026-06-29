import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SourcesResponse } from "@portal/api/sources";
import { KpiStrip } from "@portal/components/sources/KpiStrip";

const RESPONSE: SourcesResponse = {
  kpis: [
    { value: 4, description: "connections" },
    { value: 2, description: "referenced by a policy" },
    { value: 2, description: "unused" },
  ],
  sources: [],
};

const meta: Meta<typeof KpiStrip> = {
  title: "Portal/Sources/KpiStrip",
  component: KpiStrip,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof KpiStrip>;

export const Ready: Story = {
  args: { data: RESPONSE, loading: false },
};

/** Loading collapses every card to the placeholder dash. */
export const Loading: Story = {
  args: { data: null, loading: true },
};
