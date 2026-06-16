import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildPoliciesResponse } from "@portal/mocks/policies";
import { SummaryStrip } from "@portal/components/policies/SummaryStrip";

const PRO = buildPoliciesResponse("pro");

const meta: Meta<typeof SummaryStrip> = {
  title: "Portal/Policies/SummaryStrip",
  component: SummaryStrip,
  parameters: { layout: "padded" },
  args: { data: PRO, loading: false },
};
export default meta;
type Story = StoryObj<typeof SummaryStrip>;

export const Default: Story = {};

/** No data yet — every tile shows the em-dash placeholder. */
export const Loading: Story = {
  args: { data: null, loading: true },
};

export const Enterprise: Story = {
  args: { data: buildPoliciesResponse("enterprise") },
};
