import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PoliciesResponse } from "@portal/api/policies";
import { CatalogueSummary } from "@portal/components/policies/CatalogueSummary";

const RESPONSE: PoliciesResponse = {
  summary: { active: 1, paused: 0, categories: 5, docsEnforced: 4821 },
  catalogue: [],
};

const meta: Meta<typeof CatalogueSummary> = {
  title: "Portal/Policies/CatalogueSummary",
  component: CatalogueSummary,
  parameters: { layout: "padded" },
  args: { data: RESPONSE, loading: false },
};
export default meta;
type Story = StoryObj<typeof CatalogueSummary>;

export const Default: Story = {};

/** No data yet — every tile shows the em-dash placeholder. */
export const Loading: Story = { args: { data: null, loading: true } };
