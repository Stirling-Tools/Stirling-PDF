import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildSourcesResponse } from "@portal/mocks/sources";
import { KpiStrip } from "@portal/components/sources/KpiStrip";

const meta: Meta<typeof KpiStrip> = {
  title: "Portal/Sources/KpiStrip",
  component: KpiStrip,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof KpiStrip>;

export const Pro: Story = {
  args: { data: buildSourcesResponse("pro"), loading: false },
};

export const Enterprise: Story = {
  args: { data: buildSourcesResponse("enterprise"), loading: false },
};

/** Loading collapses every card to the placeholder dash. */
export const Loading: Story = {
  args: { data: null, loading: true },
};

/** Free tier reports zeros and a "connect a source" prompt. */
export const Free: Story = {
  args: { data: buildSourcesResponse("free"), loading: false },
};
