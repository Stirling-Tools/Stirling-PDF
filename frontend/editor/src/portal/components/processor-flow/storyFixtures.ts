/**
 * Shared fixtures for the processor-flow stories. The columns and the Sankey
 * all read slices of one ProcessorFlow model, so building it in one place keeps
 * the parent visualiser and the individual column stories showing the same
 * machine rather than drifting apart.
 */
import type {
  FlowComingSoonSource,
  FlowOutcome,
  FlowPolicy,
  ProcessorFlow as ProcessorFlowModel,
} from "@portal/api/processorFlow";

export interface FlowModelArgs {
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

export const CATEGORY_LABEL = (id: string) =>
  `portal.policies.categories.${id}.label`;

export const COMING_SOON_SOURCES: FlowComingSoonSource[] = [
  { key: "apiMcp", labelKey: "portal.processorFlow.sources.comingSoon.apiMcp" },
  { key: "cloud", labelKey: "portal.processorFlow.sources.comingSoon.cloud" },
  { key: "email", labelKey: "portal.processorFlow.sources.comingSoon.email" },
];

/** A running machine: three sources, Security live, mostly-delivered outcomes. */
export const BUSY_FLOW: FlowModelArgs = {
  editorRate: 400,
  claimsRate: 800,
  contractsRate: 150,
  delivered: 90,
  failed: 10,
  classificationActive: true,
};

/** Nothing configured and nothing flowing — every empty state at once. */
export const IDLE_FLOW: FlowModelArgs = {
  editorRate: 0,
  claimsRate: 0,
  contractsRate: 0,
  delivered: 0,
  failed: 0,
  classificationActive: false,
};

/** Build a flow model from the tunable args above. */
export function buildFlowModel(a: FlowModelArgs): ProcessorFlowModel {
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
  return {
    sources,
    comingSoonSources: COMING_SOON_SOURCES,
    policies,
    outcomes,
  };
}

/** Count of policies the waist splits across. */
export function activeCount(model: ProcessorFlowModel): number {
  return model.policies.filter((p) => p.state === "active").length;
}
