/**
 * Policies fixtures and the canonical TS model the portal shares with them.
 *
 * Wire types (`WirePolicy`, `WirePipelineStep`) come from the shared codec
 * layer and match the backend record exactly. Catalogue and UI types
 * (`PolicyCategory`, `PolicyConfigDef`, `PolicyState`, …) are portal-only:
 * the backend has no "category" concept — `categoryId` rides in
 * `output.options`. The catalogue assembles client-side in `api/policies.ts`
 * from the decoded wire records + these static definitions.
 *
 * api/policies.ts re-exports everything; components never reach in here.
 */

import type { WirePipelineStep, WirePolicy } from "@shared/policies/types";
import type { PolicyRunView } from "@shared/policies/types";

export type {
  PolicyActivityItem,
  PolicyDecodedState,
  PolicyRunStatus,
  PolicyRunView,
  PolicyStats,
  WireOutputOptions,
  WireOutputSpec,
  WirePipelineStep,
  WirePolicy,
} from "@shared/policies/types";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Catalogue model — portal-specific (lifted from editor types/policies.ts) */
/* ──────────────────────────────────────────────────────────────────────── */

export type PolicyStatus = "active" | "paused";

export type PolicyRowStatus = "active" | "paused" | "setup";

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
  icon: string;
  tone: "neutral" | "blue" | "purple" | "green" | "amber" | "red";
  desc: string;
  providesClassification?: boolean;
  comingSoon?: boolean;
}

export interface PolicyConfigDef {
  summary: string;
  rules: string[];
  scopeLabel: string;
  fields: PolicyField[];
  defaultOperations: WirePipelineStep[];
}

export interface PolicyState {
  configured: boolean;
  status: PolicyStatus;
  sources: string[];
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
  fieldValues: Record<string, boolean | string | string[]>;
  sources: string[];
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
  stats: import("@shared/policies/types").PolicyStats;
  activity: import("@shared/policies/types").PolicyActivityItem[];
}

export interface PoliciesSummary {
  active: number;
  paused: number;
  categories: number;
  docsEnforced: number;
}

export interface PoliciesResponse {
  summary: PoliciesSummary;
  catalogue: CatalogueEntry[];
}

export interface CatalogueEntry {
  category: PolicyCategory;
  config: PolicyConfigDef;
  policy: DecoratedPolicy | null;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Tool → endpoint registry                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

export const TOOL_ENDPOINTS: Record<string, string> = {
  redact: "/api/v1/security/auto-redact",
  sanitize: "/api/v1/security/sanitize-pdf",
  watermark: "/api/v1/security/add-watermark",
  ocr: "/api/v1/misc/ocr-pdf",
  flatten: "/api/v1/misc/flatten",
  compress: "/api/v1/misc/compress-pdf",
};

export const ENDPOINT_LABELS: Record<string, string> = {
  "/api/v1/security/auto-redact": "Redact PII",
  "/api/v1/security/sanitize-pdf": "Remove JavaScript",
  "/api/v1/security/add-watermark": "Watermark",
  "/api/v1/misc/ocr-pdf": "OCR",
  "/api/v1/misc/flatten": "Flatten",
  "/api/v1/misc/compress-pdf": "Compress",
};

export function humanizeEndpoint(path: string): string {
  if (ENDPOINT_LABELS[path]) return ENDPOINT_LABELS[path];
  const last = path.split("/").filter(Boolean).pop() ?? path;
  return last
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Catalogue definitions                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

const DEFAULT_PII_PATTERNS: string[] = [
  "\\b(?!000|666|9\\d{2})\\d{3}([- ])(?!00)\\d{2}\\1(?!0000)\\d{4}\\b",
  "\\b(?:4\\d{12}(?:\\d{3})?|5[1-5]\\d{14}|3[47]\\d{13}|6(?:011|5\\d{2})\\d{12})\\b",
];

export const POLICY_CATEGORIES: PolicyCategory[] = [
  {
    id: "ingestion",
    label: "Ingestion",
    icon: "layers",
    tone: "blue",
    desc: "Classify documents, extract structured data, enforce naming conventions, and normalize pages.",
    providesClassification: true,
    comingSoon: true,
  },
  {
    id: "security",
    label: "Security",
    icon: "shield",
    tone: "purple",
    desc: "Detect PII, redact, strip active content, and watermark documents.",
  },
  {
    id: "compliance",
    label: "Compliance",
    icon: "check",
    tone: "amber",
    desc: "Enforce HIPAA, GDPR, SOC 2, or FedRAMP requirements on every document.",
    comingSoon: true,
  },
  {
    id: "routing",
    label: "Routing",
    icon: "route",
    tone: "green",
    desc: "Auto-route documents to the right team, folder, or system.",
    comingSoon: true,
  },
  {
    id: "retention",
    label: "Retention",
    icon: "clock",
    tone: "neutral",
    desc: "Set how long documents are kept, when to archive, and when to delete.",
    comingSoon: true,
  },
];

export const POLICY_CONFIG: Record<string, PolicyConfigDef> = {
  ingestion: {
    summary:
      "Classifies documents, extracts structured data, enforces naming, and normalizes pages.",
    rules: ["Classify", "Extract", "Name", "Normalize"],
    scopeLabel: "All documents",
    defaultOperations: [
      { operation: TOOL_ENDPOINTS.ocr, parameters: {} },
      { operation: TOOL_ENDPOINTS.flatten, parameters: {} },
    ],
    fields: [
      {
        label: "Min confidence",
        key: "minConfidence",
        type: "select",
        value: "80%",
        options: ["60%", "70%", "80%", "90%", "95%"],
      },
      {
        label: "Below threshold",
        key: "belowThreshold",
        type: "select",
        value: "Flag for review",
        options: ["Flag for review", "Route to bucket", "Hold"],
      },
    ],
  },
  security: {
    summary:
      "Detects and redacts PII, strips active content (JavaScript), and watermarks documents.",
    rules: ["Redact PII", "Remove JavaScript", "Watermark"],
    scopeLabel: "All documents",
    defaultOperations: [
      {
        operation: TOOL_ENDPOINTS.redact,
        parameters: {
          mode: "automatic",
          useRegex: true,
          convertPDFToImage: true,
          wordsToRedact: DEFAULT_PII_PATTERNS,
        },
      },
      {
        operation: TOOL_ENDPOINTS.sanitize,
        parameters: {
          removeJavaScript: true,
          removeEmbeddedFiles: false,
          removeMetadata: false,
          removeLinks: false,
          removeFonts: false,
        },
      },
      {
        operation: TOOL_ENDPOINTS.watermark,
        // convertPDFToImage bakes the watermark in so it can't be stripped
        parameters: {
          convertPDFToImage: true,
        },
      },
    ],
    fields: [],
  },
  compliance: {
    summary:
      "Validates documents against regulatory frameworks before they leave the system.",
    rules: ["Framework scan", "Enforce action", "Audit trail"],
    scopeLabel: "All documents",
    defaultOperations: [
      { operation: TOOL_ENDPOINTS.sanitize, parameters: {} },
      { operation: TOOL_ENDPOINTS.flatten, parameters: {} },
    ],
    fields: [
      {
        label: "Frameworks",
        key: "frameworks",
        type: "chips",
        value: ["HIPAA"],
        options: ["HIPAA", "GDPR", "SOC 2", "FedRAMP", "PCI DSS", "ISO 27001"],
      },
      {
        label: "When non-compliant",
        key: "onViolation",
        type: "select",
        value: "Flag for review",
        options: [
          "Flag for review",
          "Block export",
          "Auto-redact PHI",
          "Quarantine document",
        ],
      },
      { label: "Audit trail", key: "auditTrail", type: "toggle", value: true },
      { label: "Access log", key: "accessLog", type: "toggle", value: true },
    ],
  },
  routing: {
    summary:
      "Routes documents to the right destination based on type and classification.",
    rules: ["Auto-classify", "Route to folder", "Webhook notify"],
    scopeLabel: "All documents",
    defaultOperations: [{ operation: TOOL_ENDPOINTS.compress, parameters: {} }],
    fields: [
      {
        label: "Destination",
        key: "destination",
        type: "select",
        value: "Documents",
        options: ["Documents", "S3 bucket", "SharePoint", "Webhook"],
      },
      { label: "Webhook URL", key: "webhookUrl", type: "text", value: "" },
      { label: "Notify on route", key: "notify", type: "toggle", value: false },
    ],
  },
  retention: {
    summary:
      "Enforces how long documents are kept, when to archive, and when to delete.",
    rules: ["Retention hold", "Auto-archive", "Deletion block"],
    scopeLabel: "All documents",
    defaultOperations: [{ operation: TOOL_ENDPOINTS.compress, parameters: {} }],
    fields: [
      {
        label: "Keep for",
        key: "keepFor",
        type: "select",
        value: "7 years",
        options: ["30 days", "1 year", "3 years", "7 years", "Indefinite"],
      },
      {
        label: "Archive after",
        key: "archiveAfter",
        type: "select",
        value: "Never",
        options: ["30 days", "90 days", "1 year", "Never"],
      },
      {
        label: "Immutable hold",
        key: "immutableHold",
        type: "toggle",
        value: false,
      },
    ],
  },
};

export const POLICY_DOC_TYPES: string[] = [
  "Contracts",
  "Invoices",
  "Tax documents",
  "HR records",
  "Insurance",
  "Medical / PHI",
  "Legal filings",
  "Financial reports",
];

/* ──────────────────────────────────────────────────────────────────────── */
/*  Seed data — real backend wire format                                      */
/* ──────────────────────────────────────────────────────────────────────── */

export function seedPolicies(): WirePolicy[] {
  return [
    {
      id: "pol_security_default",
      name: "Security Policy",
      owner: "security@acme.com",
      enabled: true,
      trigger: null,
      steps: POLICY_CONFIG.security.defaultOperations,
      output: {
        type: "inline",
        options: {
          runOn: "upload",
          mode: "new_version",
          name: "",
          position: "suffix",
          maxRetries: 3,
          retryDelayMinutes: 5,
          categoryId: "security",
          sources: ["src-claims"],
          scopeTypes: [],
          reviewerEmail: "security@acme.com",
          fieldValues: {},
        },
      },
    },
  ];
}

const NOW = Date.now();
const M = 60000;
const H = 3600000;
const D = 86400000;

/** Seed `PolicyRunView` records that drive the activity feed + stats. */
export function seedPolicyRuns(): PolicyRunView[] {
  return [
    {
      runId: "run_001",
      policyId: "pol_security_default",
      status: "COMPLETED",
      currentStep: 2,
      stepCount: 2,
      error: null,
      outputs: [{ fileId: "f1", fileName: "Q2-vendor-agreement.pdf" }],
      createdAt: NOW - 12 * M,
    },
    {
      runId: "run_002",
      policyId: "pol_security_default",
      status: "FAILED",
      currentStep: 1,
      stepCount: 2,
      error: "Low-confidence match — routed for review",
      outputs: [{ fileId: "f2", fileName: "patient-intake-0481.pdf" }],
      createdAt: NOW - 1 * H,
    },
    {
      runId: "run_003",
      policyId: "pol_security_default",
      status: "RUNNING",
      currentStep: 1,
      stepCount: 2,
      error: null,
      outputs: [{ fileId: "f3", fileName: "invoice-7782.pdf" }],
      createdAt: NOW - 2 * M,
    },
    // Older completed runs for stats
    ...Array.from({ length: 4818 }, (_, i) => ({
      runId: `run_old_${i}`,
      policyId: "pol_security_default",
      status: "COMPLETED" as const,
      currentStep: 2,
      stepCount: 2,
      error: null,
      outputs: [] as { fileId: string; fileName: string }[],
      createdAt: NOW - (34 * D + i * 10 * M),
    })),
  ];
}
