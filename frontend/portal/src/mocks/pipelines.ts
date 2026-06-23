/**
 * Pipelines fixtures and the types api/pipelines.ts shares with them.
 * api/pipelines.ts imports the types; the MSW handlers in mocks/handlers/
 * serve the fixture data over the intercepted httpJson() calls. Components
 * never reach into this module directly.
 *
 * Fixtures are tier-shaped:
 *   - free        → empty (prompts "build your first pipeline")
 *   - pro         → a small deployed fleet
 *   - enterprise  → a larger fleet plus a shadow/comparative evals note
 */

import type { Tier } from "@portal/contexts/TierContext";

/** A deployed pipeline's live health. */
export type PipelineStatus = "healthy" | "degraded";

/** 24-hour rollup shown on the pipeline row. */
export interface PipelineMetrics {
  /** Docs processed in the trailing 24h. */
  docs24h: number;
  /** Sustained throughput, docs/min. */
  throughputPerMin: number;
  /** Error rate as a fraction (0.004 = 0.4%). */
  errorRate: number;
  /** P95 stage-to-store latency, ms. */
  p95LatencyMs: number;
  /** Uptime over the trailing 24h, as a fraction. */
  uptime: number;
}

/**
 * The five silent stages every pipeline passes a document through. The accent
 * is fixed per stage so the chip row reads the same across every pipeline:
 * Ingest=green, Validate=blue, Modify=amber, Secure=red, Route/Store=purple.
 */
export type StageKey = "ingest" | "validate" | "modify" | "secure" | "route";

export interface StageSummary {
  key: StageKey;
  label: string;
  /** Op labels active in this stage for this pipeline. */
  ops: string[];
}

/** Golden-set validation rollup. */
export interface GoldenSet {
  passing: number;
  total: number;
  /** Last time the set was run. */
  lastRun: string;
  /**
   * Minimum pass rate (fraction) this pipeline must hold to be considered
   * reliable. A pipeline below its own bound is amber/red at a glance — the
   * bound is per-pipeline because a clause-risk pipeline tolerates less slack
   * than a high-volume extraction one.
   */
  threshold: number;
}

/** A single field whose shape has drifted from the inferred schema. */
export interface SchemaDrift {
  field: string;
  /** Human summary of what changed. */
  note: string;
  /** Confidence delta since the last known-good shape (negative = worse). */
  confidenceDelta: number;
  severity: "info" | "warning";
  /** Share of docs in the window that exhibited the drift. */
  affectedDocs: number;
}

export interface Pipeline {
  id: string;
  name: string;
  /** What the pipeline does, one line. */
  blurb: string;
  status: PipelineStatus;
  /** Source rail label (from SOURCE_OPTIONS). */
  source: string;
  /** Destination rail label (from DESTINATION_OPTIONS). */
  destination: string;
  /** Deployed version tag. */
  version: string;
  /** Regions the pipeline runs in. */
  regions: string[];
  metrics: PipelineMetrics;
  stages: StageSummary[];
  golden: GoldenSet;
  drift: SchemaDrift[];
}

const STAGE_LABEL: Record<StageKey, string> = {
  ingest: "Ingest",
  validate: "Validate",
  modify: "Modify",
  secure: "Secure",
  route: "Route / Store",
};

/** Build a five-stage summary from the per-stage op-label lists. */
function stages(
  ingest: string[],
  validate: string[],
  modify: string[],
  secure: string[],
  route: string[],
): StageSummary[] {
  const byKey: Record<StageKey, string[]> = {
    ingest,
    validate,
    modify,
    secure,
    route,
  };
  return (Object.keys(byKey) as StageKey[]).map((key) => ({
    key,
    label: STAGE_LABEL[key],
    ops: byKey[key],
  }));
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Tier fixtures                                                           */
/* ──────────────────────────────────────────────────────────────────────── */

const COI_COMPLIANCE: Pipeline = {
  id: "pl-coi",
  name: "COI Compliance",
  blurb: "Certificate-of-insurance intake → coverage-gap check → vault",
  status: "healthy",
  source: "Email intake",
  destination: "Stirling vault",
  version: "v3.4.1",
  regions: ["us-east-1", "eu-west-1"],
  metrics: {
    docs24h: 28941,
    throughputPerMin: 22,
    errorRate: 0.004,
    p95LatencyMs: 412,
    uptime: 0.9998,
  },
  stages: stages(
    ["OCR", "Classify", "Extract"],
    ["Schema validate", "Confidence bounds"],
    ["Compress"],
    ["Redact PII", "Encryption at rest"],
    ["Primary store", "Processing manifest"],
  ),
  golden: { passing: 36, total: 36, lastRun: "2h ago", threshold: 0.95 },
  drift: [],
};

const PRIOR_AUTH: Pipeline = {
  id: "pl-prior-auth",
  name: "Prior Auth Router",
  blurb: "Prior-authorization intake → medical-necessity gate → payer webhook",
  status: "degraded",
  source: "Inbound webhook",
  destination: "Outbound webhook",
  version: "v3.1.0",
  regions: ["us-east-1"],
  metrics: {
    docs24h: 11204,
    throughputPerMin: 9,
    errorRate: 0.031,
    p95LatencyMs: 740,
    uptime: 0.9962,
  },
  stages: stages(
    ["OCR", "Classify", "Extract"],
    ["Schema validate", "Counterparty match", "Confidence bounds"],
    ["Convert"],
    ["Redact PII", "PII/PHI enforcement", "Encryption at rest"],
    ["Conditional routing", "Human review"],
  ),
  // Below its own 0.90 bound (24/28 ≈ 0.857) — the at-a-glance reliability miss.
  golden: { passing: 24, total: 28, lastRun: "47m ago", threshold: 0.9 },
  drift: [
    {
      field: "procedure_codes",
      note: "New CPT modifier suffix not seen in prior examples",
      confidenceDelta: -0.07,
      severity: "warning",
      affectedDocs: 18,
    },
    {
      field: "payer",
      note: "Two payers now emit a merged-entity name",
      confidenceDelta: -0.03,
      severity: "info",
      affectedDocs: 6,
    },
  ],
};

const INVOICE_AP: Pipeline = {
  id: "pl-invoice-ap",
  name: "Invoice → AP",
  blurb: "Invoice extraction → three-way match → Postgres",
  status: "healthy",
  source: "S3 bucket watch",
  destination: "Database",
  version: "v2.8.0",
  regions: ["us-east-1", "eu-west-1", "ap-southeast-1"],
  metrics: {
    docs24h: 53120,
    throughputPerMin: 41,
    errorRate: 0.006,
    p95LatencyMs: 358,
    uptime: 0.9997,
  },
  stages: stages(
    ["Parse", "Classify", "Extract"],
    ["Schema validate", "Confidence bounds"],
    ["PDF → CSV"],
    ["Redact PII", "Encryption at rest"],
    ["Primary store", "Mirror to bucket", "Notify"],
  ),
  golden: { passing: 41, total: 42, lastRun: "1h ago", threshold: 0.95 },
  drift: [
    {
      field: "tax",
      note: "EU reverse-charge invoices omit a line-level tax field",
      confidenceDelta: -0.02,
      severity: "info",
      affectedDocs: 4,
    },
  ],
};

const CONTRACT_REVIEW: Pipeline = {
  id: "pl-contract",
  name: "Contract Review",
  blurb: "Contract intake → clause-risk analysis → review queue",
  status: "healthy",
  source: "Upload API",
  destination: "Another pipeline",
  version: "v1.9.2",
  regions: ["eu-west-1"],
  metrics: {
    docs24h: 4380,
    throughputPerMin: 4,
    errorRate: 0.009,
    p95LatencyMs: 1280,
    uptime: 0.9991,
  },
  stages: stages(
    ["OCR", "Classify"],
    ["Contract analyzer", "Authenticity", "Confidence bounds"],
    ["Document summarizer"],
    ["Redact PII", "Confidentiality mark", "Signed outputs"],
    ["Human review", "Flag"],
  ),
  golden: { passing: 31, total: 33, lastRun: "5h ago", threshold: 0.95 },
  drift: [],
};

const KYC_PROCESSOR: Pipeline = {
  id: "pl-kyc",
  name: "KYC Processor",
  blurb:
    "Identity-document intake → authenticity + sanctions → compliance archive",
  status: "healthy",
  source: "Scheduled import",
  destination: "Compliance archive",
  version: "v4.0.3",
  regions: ["us-east-1", "eu-west-1", "ap-southeast-1"],
  metrics: {
    docs24h: 19870,
    throughputPerMin: 15,
    errorRate: 0.005,
    p95LatencyMs: 503,
    uptime: 0.9999,
  },
  stages: stages(
    ["OCR", "Classify", "Extract"],
    ["Authenticity", "Tamper check", "Counterparty match"],
    ["Convert"],
    ["Field-aware redact", "Attribution watermark", "Encryption at rest"],
    ["Compliance archive", "Processing manifest", "Notify"],
  ),
  golden: { passing: 52, total: 54, lastRun: "31m ago", threshold: 0.95 },
  drift: [
    {
      field: "document_number",
      note: "New passport series uses a 9-char alphanumeric format",
      confidenceDelta: -0.04,
      severity: "warning",
      affectedDocs: 11,
    },
  ],
};

/**
 * Enterprise-only evals note. Surfaced as a banner: shadow + comparative eval
 * runs gate every promotion, so the deployed fleet always trails a quietly
 * running candidate.
 */
export interface EvalsNote {
  /** Pipelines currently running a shadow eval against production traffic. */
  shadowCount: number;
  /** Comparative (champion/challenger) runs awaiting sign-off. */
  comparativeCount: number;
  detail: string;
}

const ENTERPRISE_EVALS: EvalsNote = {
  shadowCount: 2,
  comparativeCount: 2,
  detail:
    "Prior Auth v3.2.0-rc and Invoice v2.9.0-rc are mirroring live traffic in shadow; KYC v4.1.0 is in a comparative run against v4.0.3. The Contract Review v2.0.0 candidate is blocked — it regressed 3 golden cases on clause-risk scoring, so the comparative run is held until the candidate is re-cut. No promotion happens until a candidate clears its golden set and the comparative delta stays inside bounds.",
};

/**
 * A pipeline that began life as an Editor watch-folder flow and was promoted
 * into the portal. These are the on-ramp from ad-hoc desktop automation to a
 * governed, deployed pipeline — they keep a pointer back to the watch folder
 * they grew out of so the lineage stays visible.
 */
export interface PromotedPipeline {
  id: string;
  name: string;
  /** Doc type the originating watch-folder flow was built around. */
  sourceDocType: string;
  /** The Editor watch folder this was promoted from. */
  watchFolder: string;
  /** Where the promotion sits in its lifecycle. */
  status: PromotedStatus;
  /** When the promotion landed. */
  promotedAt: string;
}

/**
 * A promoted flow is `deployed` once it runs in the portal, `staged` while it
 * mirrors the watch folder without taking over, and `review` when it needs a
 * human to confirm the flow before it goes live.
 */
export type PromotedStatus = "deployed" | "staged" | "review";

export interface PipelinesResponse {
  pipelines: Pipeline[];
  /** Present for enterprise only. */
  evals: EvalsNote | null;
  /** Flows promoted up from Editor watch folders. Empty on free. */
  promoted: PromotedPipeline[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Promoted-from-Editor fixtures                                            */
/* ──────────────────────────────────────────────────────────────────────── */

const PROMOTED_PRO: PromotedPipeline[] = [
  {
    id: "pl-promo-statements",
    name: "Bank Statement Normalizer",
    sourceDocType: "Bank statement",
    watchFolder: "~/StirlingWatch/statements-in",
    status: "deployed",
    promotedAt: "promoted 3d ago",
  },
  {
    id: "pl-promo-receipts",
    name: "Receipt Splitter",
    sourceDocType: "Expense receipt",
    watchFolder: "~/StirlingWatch/receipts",
    status: "staged",
    promotedAt: "promoted 11h ago",
  },
];

const PROMOTED_ENTERPRISE: PromotedPipeline[] = [
  ...PROMOTED_PRO,
  {
    id: "pl-promo-claims",
    name: "Claims Intake Splitter",
    sourceDocType: "Insurance claim",
    watchFolder: "\\\\fileserver\\ClaimsDropbox",
    status: "deployed",
    promotedAt: "promoted 6d ago",
  },
  {
    id: "pl-promo-onboarding",
    name: "New-Hire Packet Sorter",
    sourceDocType: "Onboarding packet",
    watchFolder: "\\\\hr-share\\NewHireScans",
    status: "review",
    promotedAt: "promoted 2h ago",
  },
];

export function pipelinesFor(tier: Tier): PipelinesResponse {
  if (tier === "free") {
    return { pipelines: [], evals: null, promoted: [] };
  }
  if (tier === "enterprise") {
    return {
      pipelines: [
        INVOICE_AP,
        COI_COMPLIANCE,
        PRIOR_AUTH,
        KYC_PROCESSOR,
        CONTRACT_REVIEW,
      ],
      evals: ENTERPRISE_EVALS,
      promoted: PROMOTED_ENTERPRISE,
    };
  }
  // pro
  return {
    pipelines: [COI_COMPLIANCE, INVOICE_AP, PRIOR_AUTH],
    evals: null,
    promoted: PROMOTED_PRO,
  };
}
