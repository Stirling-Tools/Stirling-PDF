import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { ProcessorFlow } from "@portal/components/ProcessorFlow";
import type {
  FlowOutcome,
  FlowPolicy,
  ProcessorFlow as ProcessorFlowModel,
} from "@portal/api/processorFlow";

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

interface PlaygroundArgs {
  /** Editor input volume (docs / 24h). */
  editorRate: number;
  /** "Claims intake" input volume (docs / 24h). */
  claimsRate: number;
  /** "Contracts drop" input volume (docs / 24h). */
  contractsRate: number;
  /** Delivered (success) outcomes over 24h. */
  delivered: number;
  /** Failed outcomes over 24h — drives the red-dot ratio. */
  failed: number;
  /** Whether the Classification policy is active (a second particle lane). */
  classificationActive: boolean;
}

const CATEGORY_LABEL = (id: string) => `portal.policies.categories.${id}.label`;

/** Build a flow model from the playground controls. */
function buildModel(a: PlaygroundArgs): ProcessorFlowModel {
  const sources = [
    { id: "editor", name: "Editor", type: "editor", docs24h: a.editorRate },
    {
      id: "claims",
      name: "Claims intake",
      type: "folder",
      docs24h: a.claimsRate,
    },
    {
      id: "contracts",
      name: "Contracts drop",
      type: "folder",
      docs24h: a.contractsRate,
    },
  ];
  const policies: FlowPolicy[] = [
    {
      key: "ingestion",
      labelKey: CATEGORY_LABEL("ingestion"),
      state: "locked",
      configured: false,
      runs24h: 0,
    },
    {
      key: "security",
      labelKey: CATEGORY_LABEL("security"),
      state: "active",
      configured: true,
      runs24h: Math.round(a.delivered * 0.6),
    },
    {
      key: "classification",
      labelKey: CATEGORY_LABEL("classification"),
      state: a.classificationActive ? "active" : "off",
      configured: a.classificationActive,
      runs24h: a.classificationActive ? Math.round(a.delivered * 0.4) : 0,
    },
    {
      key: "compliance",
      labelKey: CATEGORY_LABEL("compliance"),
      state: "locked",
      configured: false,
      runs24h: 0,
    },
    {
      key: "routing",
      labelKey: CATEGORY_LABEL("routing"),
      state: "locked",
      configured: false,
      runs24h: 0,
    },
    {
      key: "retention",
      labelKey: CATEGORY_LABEL("retention"),
      state: "locked",
      configured: false,
      runs24h: 0,
    },
  ];
  const outcomes: FlowOutcome[] = [
    {
      key: "success",
      labelKey: "portal.processorFlow.outcomes.success",
      count24h: a.delivered,
    },
    {
      key: "failed",
      labelKey: "portal.processorFlow.outcomes.failed",
      count24h: a.failed,
    },
  ];
  const comingSoonSources = [
    {
      key: "apiMcp",
      labelKey: "portal.processorFlow.sources.comingSoon.apiMcp",
    },
    { key: "cloud", labelKey: "portal.processorFlow.sources.comingSoon.cloud" },
    { key: "email", labelKey: "portal.processorFlow.sources.comingSoon.email" },
  ];
  return { sources, comingSoonSources, policies, outcomes };
}

/** Tune each input rate and the delivered/failed split live to watch emission
 *  speed, per-source scaling, the 250ms ceiling, and the ratio (focused tab). */
export const Playground: StoryObj<PlaygroundArgs> = {
  args: {
    editorRate: 400,
    claimsRate: 800,
    contractsRate: 150,
    delivered: 90,
    failed: 10,
    classificationActive: true,
  },
  argTypes: {
    editorRate: { control: { type: "range", min: 0, max: 2000, step: 10 } },
    claimsRate: { control: { type: "range", min: 0, max: 2000, step: 10 } },
    contractsRate: { control: { type: "range", min: 0, max: 2000, step: 10 } },
    delivered: { control: { type: "number", min: 0 } },
    failed: { control: { type: "number", min: 0 } },
    classificationActive: { control: "boolean" },
  },
  render: (args) => <ProcessorFlow dataOverride={buildModel(args)} />,
};
