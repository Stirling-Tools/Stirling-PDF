/**
 * The policy/pipeline catalogue. One catalogue, two lenses: the portal's Pipelines gallery
 * and the editor's folder-processing setup both read it.
 */

import { policyStep, type PolicyToolStep } from "@app/policies/operations";
import type { ToolEndpoint } from "@app/types/toolApiTypes";
import type { WirePipelineStep } from "@app/policies/types";

export type { WirePipelineStep as PipelineStep } from "@app/policies/types";

export type PolicyStatus = "active" | "paused";

export type PolicyFieldType = "toggle" | "select" | "chips" | "text";

export interface PolicyField {
  label: string;
  key: string;
  type: PolicyFieldType;
  value: boolean | string | string[];
  options?: string[];
}

export interface PolicyCategory {
  id: string;
  label: string;
  tone: "neutral" | "blue" | "purple" | "green" | "amber" | "red";
  desc: string;
  providesClassification?: boolean;
  comingSoon?: boolean;
  requiresAiEngine?: boolean;
}

export interface PolicyConfigDef {
  summary: string;
  rules: string[];
  scopeLabel: string;
  fields: PolicyField[];
  defaultOperations: PolicyToolStep[];
}

export interface PolicyState {
  configured: boolean;
  status: PolicyStatus;
  /** A policy rather than an ordinary pipeline (see `Policy.required`). */
  required: boolean;
  name?: string;
  icon?: string;
  /** Options the wizard doesn't model, preserved so a wizard save round-trips them (see codec). */
  extraOptions?: Record<string, unknown>;
  sources: string[];
  /** Whether the editor runs this policy per file; stored, not derived from `sources`. */
  runsOnEditor?: boolean;
  scopeTypes: string[];
  reviewerEmail: string;
  fieldValues: Record<string, boolean | string | string[]>;
  outputMode?: "new_file" | "new_version";
  outputName?: string;
  outputNamePosition?: "prefix" | "suffix" | "auto-number";
  runOn?: "upload" | "export";
  maxRetries?: number;
  retryDelayMinutes?: number;
  backendId?: string;
  isDefault?: boolean;
}

export interface PolicySetupResult {
  required: boolean;
  /** Stored options the wizard doesn't model, carried through so a save preserves them (see codec). */
  extraOptions?: Record<string, unknown>;
  fieldValues: Record<string, boolean | string | string[]>;
  sources: string[];
  runsOnEditor: boolean;
  scopeTypes: string[];
  reviewerEmail: string;
  outputMode: "new_file" | "new_version";
  outputName: string;
  outputNamePosition: "prefix" | "suffix" | "auto-number";
  runOn: "upload" | "export";
  maxRetries: number;
  retryDelayMinutes: number;
  steps: WirePipelineStep[];
}

export interface DecoratedPolicy {
  category: PolicyCategory;
  config: PolicyConfigDef;
  state: PolicyState;
  steps: WirePipelineStep[];
  stats: import("@app/policies/types").PolicyStats;
  activity: import("@app/policies/types").PolicyActivityItem[];
}

export interface PoliciesResponse {
  catalogue: CatalogueEntry[];
}

export interface CatalogueEntry {
  category: PolicyCategory;
  config: PolicyConfigDef;
  policy: DecoratedPolicy | null;
}

const ENDPOINT_LABELS: Partial<
  Record<ToolEndpoint | "/api/v1/ai/tools/classify-and-label", string>
> = {
  "/api/v1/security/auto-redact": "portal.policies.endpoints.autoRedact",
  "/api/v1/security/sanitize-pdf": "portal.policies.endpoints.sanitizePdf",
  "/api/v1/security/add-watermark": "portal.policies.endpoints.addWatermark",
  "/api/v1/misc/ocr-pdf": "portal.policies.endpoints.ocrPdf",
  "/api/v1/misc/flatten": "portal.policies.endpoints.flatten",
  "/api/v1/misc/compress-pdf": "portal.policies.endpoints.compressPdf",
  "/api/v1/ai/tools/classify-and-label":
    "portal.policies.endpoints.classifyAndLabel",
};

export function humanizeEndpoint(
  path: string,
  t: (key: string) => string,
): string {
  const label = ENDPOINT_LABELS[path as ToolEndpoint];
  if (label) return t(label);
  const last = path.split("/").filter(Boolean).pop() ?? path;
  return last
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

const DEFAULT_PII_PATTERNS: string[] = [
  "\\b(?!000|666|9\\d{2})\\d{3}([- ])(?!00)\\d{2}\\1(?!0000)\\d{4}\\b",
  "\\b(?:4\\d{12}(?:\\d{3})?|5[1-5]\\d{14}|3[47]\\d{13}|6(?:011|5\\d{2})\\d{12})\\b",
];

export const POLICY_CATEGORIES: PolicyCategory[] = [
  {
    id: "ingestion",
    label: "portal.policies.categories.ingestion.label",
    tone: "blue",
    desc: "portal.policies.categories.ingestion.desc",
    providesClassification: true,
    comingSoon: true,
  },
  {
    id: "security",
    label: "portal.policies.categories.security.label",
    tone: "purple",
    desc: "portal.policies.categories.security.desc",
  },
  {
    id: "classification",
    label: "portal.policies.categories.classification.label",
    tone: "blue",
    desc: "portal.policies.categories.classification.desc",
    providesClassification: true,
  },
  {
    id: "compliance",
    label: "portal.policies.categories.compliance.label",
    tone: "amber",
    desc: "portal.policies.categories.compliance.desc",
    comingSoon: true,
  },
  {
    id: "routing",
    label: "portal.policies.categories.routing.label",
    tone: "green",
    desc: "portal.policies.categories.routing.desc",
    comingSoon: true,
  },
  {
    id: "retention",
    label: "portal.policies.categories.retention.label",
    tone: "neutral",
    desc: "portal.policies.categories.retention.desc",
    comingSoon: true,
  },
];

export const POLICY_CONFIG: Record<string, PolicyConfigDef> = {
  ingestion: {
    summary: "portal.policies.config.ingestion.summary",
    rules: [
      "portal.policies.config.ingestion.rules.0",
      "portal.policies.config.ingestion.rules.1",
      "portal.policies.config.ingestion.rules.2",
      "portal.policies.config.ingestion.rules.3",
    ],
    scopeLabel: "portal.policies.config.scopeAll",
    defaultOperations: [policyStep("ocr"), policyStep("flatten")],
    fields: [
      {
        label: "portal.policies.config.ingestion.fields.minConfidence",
        key: "minConfidence",
        type: "select",
        value: "p80",
        options: ["p60", "p70", "p80", "p90", "p95"],
      },
      {
        label: "portal.policies.config.ingestion.fields.belowThreshold",
        key: "belowThreshold",
        type: "select",
        value: "flagForReview",
        options: ["flagForReview", "routeToBucket", "hold"],
      },
    ],
  },
  security: {
    summary: "portal.policies.config.security.summary",
    rules: [
      "portal.policies.config.security.rules.0",
      "portal.policies.config.security.rules.1",
      "portal.policies.config.security.rules.2",
    ],
    scopeLabel: "portal.policies.config.scopeAll",
    defaultOperations: [
      // Flatten to image so redactions can't be lifted off.
      policyStep("redact", {
        useRegex: true,
        convertPDFToImage: true,
        wordsToRedact: DEFAULT_PII_PATTERNS,
      }),
      // JavaScript removal only; the tool enables removeEmbeddedFiles by default, so turn it off.
      policyStep("sanitize", { removeEmbeddedFiles: false }),
      // Bake in via image so it can't be stripped.
      policyStep("watermark", { convertPDFToImage: true }),
    ],
    fields: [],
  },
  classification: {
    summary: "portal.policies.config.classification.summary",
    rules: [
      "portal.policies.config.classification.rules.0",
      "portal.policies.config.classification.rules.1",
    ],
    scopeLabel: "portal.policies.config.scopeAll",
    defaultOperations: [policyStep("classify")],
    fields: [],
  },
  compliance: {
    summary: "portal.policies.config.compliance.summary",
    rules: [
      "portal.policies.config.compliance.rules.0",
      "portal.policies.config.compliance.rules.1",
      "portal.policies.config.compliance.rules.2",
    ],
    scopeLabel: "portal.policies.config.scopeAll",
    defaultOperations: [
      policyStep("sanitize"),
      policyStep("flatten"),
      policyStep("purviewApplyLabel"),
    ],
    fields: [
      {
        label: "portal.policies.config.compliance.fields.frameworks",
        key: "frameworks",
        type: "chips",
        value: ["hipaa"],
        options: ["hipaa", "gdpr", "soc2", "fedramp", "pciDss", "iso27001"],
      },
      {
        label: "portal.policies.config.compliance.fields.onViolation",
        key: "onViolation",
        type: "select",
        value: "flagForReview",
        options: [
          "flagForReview",
          "blockExport",
          "autoRedactPhi",
          "quarantineDocument",
        ],
      },
      {
        label: "portal.policies.config.compliance.fields.auditTrail",
        key: "auditTrail",
        type: "toggle",
        value: true,
      },
      {
        label: "portal.policies.config.compliance.fields.accessLog",
        key: "accessLog",
        type: "toggle",
        value: true,
      },
    ],
  },
  routing: {
    summary: "portal.policies.config.routing.summary",
    rules: [
      "portal.policies.config.routing.rules.0",
      "portal.policies.config.routing.rules.1",
      "portal.policies.config.routing.rules.2",
    ],
    scopeLabel: "portal.policies.config.scopeAll",
    defaultOperations: [policyStep("compress")],
    fields: [
      {
        label: "portal.policies.config.routing.fields.destination",
        key: "destination",
        type: "select",
        value: "documents",
        options: ["documents", "s3Bucket", "sharePoint", "webhook"],
      },
      {
        label: "portal.policies.config.routing.fields.webhookUrl",
        key: "webhookUrl",
        type: "text",
        value: "",
      },
      {
        label: "portal.policies.config.routing.fields.notify",
        key: "notify",
        type: "toggle",
        value: false,
      },
    ],
  },
  retention: {
    summary: "portal.policies.config.retention.summary",
    rules: [
      "portal.policies.config.retention.rules.0",
      "portal.policies.config.retention.rules.1",
      "portal.policies.config.retention.rules.2",
    ],
    scopeLabel: "portal.policies.config.scopeAll",
    defaultOperations: [policyStep("compress")],
    fields: [
      {
        label: "portal.policies.config.retention.fields.keepFor",
        key: "keepFor",
        type: "select",
        value: "sevenYears",
        options: [
          "thirtyDays",
          "oneYear",
          "threeYears",
          "sevenYears",
          "indefinite",
        ],
      },
      {
        label: "portal.policies.config.retention.fields.archiveAfter",
        key: "archiveAfter",
        type: "select",
        value: "never",
        options: ["thirtyDays", "ninetyDays", "oneYear", "never"],
      },
      {
        label: "portal.policies.config.retention.fields.immutableHold",
        key: "immutableHold",
        type: "toggle",
        value: false,
      },
    ],
  },
};
