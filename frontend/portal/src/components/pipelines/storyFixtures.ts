import type { Pipeline, PromotedPipeline } from "@portal/api/pipelines";

/** Sample pipelines shared by the Pipelines component stories. */

export const HEALTHY_PIPELINE: Pipeline = {
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
  stages: [
    { key: "ingest", label: "Ingest", ops: ["Parse", "Classify", "Extract"] },
    {
      key: "validate",
      label: "Validate",
      ops: ["Schema validate", "Confidence bounds"],
    },
    { key: "modify", label: "Modify", ops: ["PDF → CSV"] },
    {
      key: "secure",
      label: "Secure",
      ops: ["Redact PII", "Encryption at rest"],
    },
    { key: "route", label: "Route / Store", ops: ["Primary store", "Notify"] },
  ],
  golden: { passing: 42, total: 42, lastRun: "1h ago", threshold: 0.95 },
  drift: [],
};

export const DEGRADED_PIPELINE: Pipeline = {
  ...HEALTHY_PIPELINE,
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

/** Sample watch-folder-promoted flows for the PromotedPipelines stories. */
export const PROMOTED_PIPELINES: PromotedPipeline[] = [
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
  {
    id: "pl-promo-onboarding",
    name: "New-Hire Packet Sorter",
    sourceDocType: "Onboarding packet",
    watchFolder: "\\\\hr-share\\NewHireScans",
    status: "review",
    promotedAt: "promoted 2h ago",
  },
];
