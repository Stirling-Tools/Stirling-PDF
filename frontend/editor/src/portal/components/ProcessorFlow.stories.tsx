import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { ProcessorFlow } from "@portal/components/ProcessorFlow";
import {
  BUSY_FLOW,
  type FlowModelArgs,
  buildFlowModel,
} from "@portal/components/processor-flow/storyFixtures";

/** Home processor visualiser, backed by the global portal MSW handlers.
 *  Particles animate via rAF (paused for hidden tabs — view in a focused tab). */
const meta: Meta<typeof ProcessorFlow> = {
  title: "Portal/Components/ProcessorFlow",
  component: ProcessorFlow,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof ProcessorFlow>;

/** Live machine: Security configured + real throughput → the flow runs. */
export const Default: Story = {};

/** Nothing set up and no activity — the empty state. The flow stays still here
 *  in production (DEV_KEEP_FLOWING can force it on while iterating). */
export const IdleEmpty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/sources", () =>
          HttpResponse.json({
            kpis: [],
            sources: [
              {
                id: "editor",
                name: "Editor",
                type: "editor",
                status: "active",
                referenceCount: 0,
                referencingPolicies: [],
                config: [],
                docsTotal: 0,
                docs24h: 0,
                docs30d: 0,
              },
            ],
          }),
        ),
        http.get("/api/v1/policies", () => HttpResponse.json([])),
        http.get("/api/v1/policies/runs", () => HttpResponse.json([])),
      ],
    },
  },
};

/* ── Playground ───────────────────────────────────────────────────────────── */

/** Tune each input rate and the delivered/failed split live to watch emission
 *  speed, per-source scaling, the 250ms ceiling, and the ratio (focused tab). */
export const Playground: StoryObj<FlowModelArgs> = {
  args: BUSY_FLOW,
  argTypes: {
    editorRate: { control: { type: "range", min: 0, max: 2000, step: 10 } },
    claimsRate: { control: { type: "range", min: 0, max: 2000, step: 10 } },
    contractsRate: { control: { type: "range", min: 0, max: 2000, step: 10 } },
    delivered: { control: { type: "number", min: 0 } },
    failed: { control: { type: "number", min: 0 } },
    classificationActive: { control: "boolean" },
  },
  render: (args) => <ProcessorFlow dataOverride={buildFlowModel(args)} />,
};
