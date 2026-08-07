import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlowSankey } from "@portal/components/processor-flow/FlowSankey";
import {
  BUSY_FLOW,
  IDLE_FLOW,
  buildFlowModel,
} from "@portal/components/processor-flow/storyFixtures";

const busy = buildFlowModel(BUSY_FLOW);
const idle = buildFlowModel(IDLE_FLOW);

/** Sankey lens: ribbon width is proportional to 24h volume, and the waist
 *  splits once per active policy. */
const meta: Meta<typeof FlowSankey> = {
  title: "Portal/ProcessorFlow/FlowSankey",
  component: FlowSankey,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof FlowSankey>;

/** Three sources at different rates, two active policies, mostly delivered. */
export const Default: Story = {
  args: {
    sources: busy.sources,
    outcomes: busy.outcomes,
    policies: busy.policies,
  },
};

/** A single active policy — the waist does not split. */
export const OneActivePolicy: Story = {
  args: {
    sources: busy.sources,
    outcomes: busy.outcomes,
    policies: busy.policies.map((p) =>
      p.key === "classification" ? { ...p, state: "off", runs24h: 0 } : p,
    ),
  },
};

/** One source carrying nearly all the volume — the widest ribbon dominates. */
export const LopsidedVolume: Story = {
  args: {
    sources: busy.sources.map((s) =>
      s.id === "claims" ? { ...s, docs24h: 5000 } : { ...s, docs24h: 20 },
    ),
    outcomes: busy.outcomes,
    policies: busy.policies,
  },
};

/** Every document failed — the outcome side is entirely the failure ribbon. */
export const AllFailing: Story = {
  args: {
    sources: busy.sources,
    outcomes: busy.outcomes.map((o) =>
      o.key === "success" ? { ...o, count24h: 0 } : { ...o, count24h: 120 },
    ),
    policies: busy.policies,
  },
};

/** Nothing has flowed in 24h — the diagram is replaced by its empty state. */
export const Empty: Story = {
  args: {
    sources: idle.sources,
    outcomes: idle.outcomes,
    policies: idle.policies,
  },
};
