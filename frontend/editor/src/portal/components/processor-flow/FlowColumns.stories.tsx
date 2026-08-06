/**
 * The three flow columns. They are normally mounted together by ProcessorFlow,
 * which measures them to thread particles between the columns; in isolation the
 * measurement refs are inert collectors, so each column can be exercised on its
 * own without the geometry hooks.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlowSources } from "@portal/components/processor-flow/FlowSources";
import { FlowPolicies } from "@portal/components/processor-flow/FlowPolicies";
import { FlowOutcomes } from "@portal/components/processor-flow/FlowOutcomes";
import {
  BUSY_FLOW,
  IDLE_FLOW,
  activeCount,
  buildFlowModel,
} from "@portal/components/processor-flow/storyFixtures";

const busy = buildFlowModel(BUSY_FLOW);
const idle = buildFlowModel(IDLE_FLOW);

/** ProcessorFlow measures the mounted nodes to place particles. Nothing reads
 *  these back here, so a fresh collector per render is enough. */
const slots = () => ({ current: [] as (HTMLElement | null)[] });
const record = () => ({ current: {} as Record<string, HTMLElement> });
const noop = () => {};

const meta: Meta = {
  title: "Portal/ProcessorFlow/Columns",
  parameters: { layout: "padded" },
};
export default meta;

/* ── Sources (left) ───────────────────────────────────────────────────────── */

/** Live source cards above the coming-soon connect cards. */
export const Sources: StoryObj<typeof FlowSources> = {
  render: () => (
    <FlowSources
      sources={busy.sources}
      comingSoonSources={busy.comingSoonSources}
      srcRefs={slots()}
      onOpen={noop}
    />
  ),
};

/** No sources connected yet — only the coming-soon cards remain. */
export const SourcesEmpty: StoryObj<typeof FlowSources> = {
  render: () => (
    <FlowSources
      sources={[]}
      comingSoonSources={busy.comingSoonSources}
      srcRefs={slots()}
      onOpen={noop}
    />
  ),
};

/** A long source name, to check the card truncates rather than pushing the
 *  column wider than the flow it has to line up with. */
export const SourcesLongName: StoryObj<typeof FlowSources> = {
  render: () => (
    <FlowSources
      sources={[
        {
          ...busy.sources[0],
          name: "Contracts drop — EU region, legal review queue",
        },
      ]}
      comingSoonSources={[]}
      srcRefs={slots()}
      onOpen={noop}
    />
  ),
};

/* ── Policies (centre waist) ──────────────────────────────────────────────── */

/** Two active policies, the rest locked or off. */
export const Policies: StoryObj<typeof FlowPolicies> = {
  render: () => (
    <FlowPolicies
      policies={busy.policies}
      activeCount={activeCount(busy)}
      coreRef={{ current: null }}
      laneRefs={record()}
      onSetup={noop}
    />
  ),
};

/** Nothing configured — every policy sits locked or off. */
export const PoliciesIdle: StoryObj<typeof FlowPolicies> = {
  render: () => (
    <FlowPolicies
      policies={idle.policies.map((p) => ({
        ...p,
        state: "off" as const,
        configured: false,
      }))}
      activeCount={0}
      coreRef={{ current: null }}
      laneRefs={record()}
      onSetup={noop}
    />
  ),
};

/** Every policy active — the widest the waist ever splits. */
export const PoliciesAllActive: StoryObj<typeof FlowPolicies> = {
  render: () => {
    const policies = busy.policies.map((p) => ({
      ...p,
      state: "active" as const,
      configured: true,
      runs24h: 120,
    }));
    return (
      <FlowPolicies
        policies={policies}
        activeCount={policies.length}
        coreRef={{ current: null }}
        laneRefs={record()}
        onSetup={noop}
      />
    );
  },
};

/* ── Outcomes (right) ─────────────────────────────────────────────────────── */

/** Delivered and failed side by side. */
export const Outcomes: StoryObj<typeof FlowOutcomes> = {
  render: () => (
    <FlowOutcomes outcomes={busy.outcomes} outRefs={slots()} onOpen={noop} />
  ),
};

/** Nothing processed in the window. */
export const OutcomesEmpty: StoryObj<typeof FlowOutcomes> = {
  render: () => (
    <FlowOutcomes outcomes={idle.outcomes} outRefs={slots()} onOpen={noop} />
  ),
};

/** Large counts, to check the numerals stay aligned as they grow. */
export const OutcomesHighVolume: StoryObj<typeof FlowOutcomes> = {
  render: () => (
    <FlowOutcomes
      outcomes={busy.outcomes.map((o) => ({
        ...o,
        count24h: o.key === "success" ? 128_400 : 2_130,
      }))}
      outRefs={slots()}
      onOpen={noop}
    />
  ),
};
