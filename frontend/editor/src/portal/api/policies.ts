/**
 * Policies service layer.
 *
 * The portal calls the real Stirling policy API (`/api/v1/policies`);
 * Storybook and tests intercept the same calls with MSW handlers.
 *
 * The flat `WirePolicy[]` + `PolicyRunView[]` responses are assembled into the
 * decorated catalogue client-side by `assemblePolicies()`, mirroring the same
 * approach the editor uses for its own catalogue view.
 */

import type { TFunction } from "i18next";
import { apiClient } from "@portal/api/http";
import { fromWirePolicy, toWirePolicy } from "@app/policies/codec";
import { runsToActivity, runsToStats } from "@app/policies/runs";
import { policyStep, type PolicyToolStep } from "@app/policies/operations";
import type { ToolEndpoint } from "@app/types/toolApiTypes";
import type {
  PolicyDecodedState,
  PolicyRunView,
  WirePipelineStep,
  WirePolicy,
} from "@app/policies/types";

export type {
  PolicyActivityItem,
  PolicyDecodedState,
  PolicyRunView,
  PolicyStats,
  WireOutputOptions,
  WireOutputSpec,
  WirePolicy,
} from "@app/policies/types";

// Re-export the wire step type under the legacy name components depend on.
export type { WirePipelineStep as PipelineStep } from "@app/policies/types";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Catalogue model — portal-specific                                        */
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
  stats: import("@app/policies/types").PolicyStats;
  activity: import("@app/policies/types").PolicyActivityItem[];
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
/*  Endpoint display labels                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * i18n keys keyed by endpoint; labels stored steps in the detail view. Mostly
 * {@link ToolEndpoint}s, plus the AI classify endpoint, which isn't part of the generated union.
 */
export const ENDPOINT_LABELS: Partial<
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

/* ──────────────────────────────────────────────────────────────────────── */
/*  Catalogue definitions                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

const DEFAULT_PII_PATTERNS: string[] = [
  "\\b(?!000|666|9\\d{2})\\d{3}([- ])(?!00)\\d{2}\\1(?!0000)\\d{4}\\b",
  "\\b(?:4\\d{12}(?:\\d{3})?|5[1-5]\\d{14}|3[47]\\d{13}|6(?:011|5\\d{2})\\d{12})\\b",
];

/** `label`/`desc` values are i18n keys — render with t(). */
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

/**
 * `summary`/`rules`/`scopeLabel`/field `label` values are i18n keys — render
 * with t(). Field `value`/`options` strings are persisted policy state and
 * stay as stable values (translating them would corrupt saved configs).
 */
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
    // Apply writes our sensitivity label into the document after it is sanitised and flattened.
    // Offered only once a Purview tenant is connected (it needs a tenant connection and a label
    // GUID, which no default can guess), and hidden entirely until then.
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

export const POLICY_DOC_TYPES: string[] = [
  "contracts",
  "invoices",
  "taxDocuments",
  "hrRecords",
  "insurance",
  "medicalPhi",
  "legalFilings",
  "financialReports",
];

// ── Client-side catalogue assembly ───────────────────────────────────────────

function decoratePolicy(
  decoded: PolicyDecodedState,
  runs: PolicyRunView[],
  isDefault: boolean,
): DecoratedPolicy | null {
  const category = POLICY_CATEGORIES.find((c) => c.id === decoded.categoryId);
  const config = POLICY_CONFIG[decoded.categoryId];
  if (!category || !config) return null;

  const policyRuns = runs.filter((r) => r.policyId === decoded.id);
  const status: PolicyStatus = decoded.enabled ? "active" : "paused";
  const state: PolicyState = {
    configured: true,
    status,
    sources: decoded.sources,
    scopeTypes: decoded.scopeTypes,
    reviewerEmail: decoded.reviewerEmail,
    fieldValues: decoded.fieldValues,
    outputMode: decoded.outputMode,
    outputName: decoded.outputName,
    outputNamePosition: decoded.outputNamePosition,
    runOn: decoded.runOn,
    maxRetries: decoded.maxRetries,
    retryDelayMinutes: decoded.retryDelayMinutes,
    backendId: decoded.id,
    isDefault,
  };

  return {
    category,
    config,
    state,
    steps: decoded.steps,
    stats: runsToStats(policyRuns),
    activity: runsToActivity(policyRuns),
  };
}

/** GET /api/v1/policies — the flat stored-policy records. */
export function fetchPoliciesList(): Promise<WirePolicy[]> {
  return apiClient.local.json<WirePolicy[]>("/api/v1/policies");
}

/** GET /api/v1/policies/runs — best-effort (empty on a backend without runs). */
export function fetchPolicyRuns(): Promise<PolicyRunView[]> {
  return apiClient.local
    .json<PolicyRunView[]>("/api/v1/policies/runs")
    .catch(() => [] as PolicyRunView[]);
}

/**
 * Pure assembly of the decorated catalogue from the two raw responses. Split
 * out so the React Query layer can fetch the list + runs as separate shared
 * cache entries (deduped across Home + Policies) and assemble client-side.
 */
export function assemblePolicies(
  wirePolicies: WirePolicy[],
  runs: PolicyRunView[],
): PoliciesResponse {
  const decodedByCategory = new Map<
    string,
    { decoded: PolicyDecodedState; isDefault: boolean }
  >();
  for (const wire of wirePolicies) {
    const decoded = fromWirePolicy(wire);
    if (decoded.categoryId) {
      decodedByCategory.set(decoded.categoryId, { decoded, isDefault: false });
    }
  }

  const catalogue: CatalogueEntry[] = POLICY_CATEGORIES.map((category) => {
    const entry = decodedByCategory.get(category.id);
    const policy = entry
      ? decoratePolicy(entry.decoded, runs, entry.isDefault)
      : null;
    return { category, config: POLICY_CONFIG[category.id], policy };
  });

  const active = wirePolicies.filter((p) => p.enabled).length;
  const paused = wirePolicies.filter((p) => !p.enabled).length;
  const enabledPolicyIds = new Set(
    wirePolicies.filter((p) => p.enabled).map((p) => p.id),
  );
  const docsEnforced = runs.filter(
    (r) =>
      r.status === "COMPLETED" &&
      r.policyId != null &&
      enabledPolicyIds.has(r.policyId),
  ).length;
  const summary: PoliciesSummary = {
    active,
    paused,
    categories: POLICY_CATEGORIES.length,
    docsEnforced,
  };

  return { summary, catalogue };
}

/** GET /api/v1/policies/{id} — one stored policy's raw record. */
export async function fetchPolicy(id: string): Promise<WirePolicy> {
  return apiClient.local.json<WirePolicy>(
    `/api/v1/policies/${encodeURIComponent(id)}`,
  );
}

/**
 * POST /api/v1/policies — create (blank id) or update (matched id). The
 * backend stamps owner + teamId server-side and returns the stored record.
 */
export async function savePolicy(wire: WirePolicy): Promise<WirePolicy> {
  return apiClient.local.json<WirePolicy>("/api/v1/policies", {
    method: "POST",
    body: wire,
  });
}

/** DELETE /api/v1/policies/{id} */
export async function deletePolicy(id: string): Promise<void> {
  await apiClient.local.json<void>(
    `/api/v1/policies/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

/**
 * DELETE /api/v1/policies/{id}/processed-history — forget which source files
 * the policy has processed, so its next sweep reprocesses everything present.
 */
export async function clearProcessedHistory(id: string): Promise<void> {
  await apiClient.local.json<void>(
    `/api/v1/policies/${encodeURIComponent(id)}/processed-history`,
    {
      method: "DELETE",
    },
  );
}

// ── Wire-build helpers (so Policies.tsx doesn't need codec knowledge) ────────

const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 5;

// Catalogue policy bodies carry categoryId at the top level so the pipelines
// mock handler can discriminate them from raw pipeline saves on the shared
// POST /api/v1/policies endpoint. The real backend ignores unknown fields.
type CatalogueWireBody = WirePolicy & { categoryId: string };

/**
 * The persisted policy name derived from its category, e.g. "Security Policy".
 * `category.label` is an i18n key, so translate it before building the name;
 * otherwise the raw key is persisted and surfaces in the UI (e.g. the Sources
 * "Used by" pill).
 */
function policyDisplayName(entry: CatalogueEntry, t: TFunction): string {
  return t("portal.policies.defaultName", {
    category: t(entry.category.label),
  });
}

/** Build a wire policy from a setup wizard result. */
export function buildWireFromSetup(
  entry: CatalogueEntry,
  result: PolicySetupResult,
  t: TFunction,
  enabled = true,
): CatalogueWireBody {
  return {
    categoryId: entry.category.id,
    ...toWirePolicy({
      id: entry.policy?.state.backendId ?? "",
      name: policyDisplayName(entry, t),
      enabled,
      categoryId: entry.category.id,
      sources: result.sources,
      scopeTypes: result.scopeTypes,
      reviewerEmail: result.reviewerEmail,
      fieldValues: result.fieldValues,
      runOn: result.runOn,
      outputMode: result.outputMode,
      outputName: result.outputName,
      outputNamePosition: result.outputNamePosition,
      maxRetries: result.maxRetries,
      retryDelayMinutes: result.retryDelayMinutes,
      steps: result.steps,
    }),
  };
}

/** Build a wire policy from an existing decorated policy (e.g. for pause/resume). */
export function buildWireFromState(
  entry: CatalogueEntry,
  policy: DecoratedPolicy,
  enabled: boolean,
  t: TFunction,
): CatalogueWireBody {
  const s = policy.state;
  return {
    categoryId: entry.category.id,
    ...toWirePolicy({
      id: s.backendId ?? "",
      name: policyDisplayName(entry, t),
      enabled,
      categoryId: entry.category.id,
      sources: s.sources,
      scopeTypes: s.scopeTypes,
      reviewerEmail: s.reviewerEmail,
      fieldValues: s.fieldValues,
      runOn: s.runOn ?? "upload",
      outputMode: s.outputMode ?? "new_version",
      outputName: s.outputName ?? "",
      outputNamePosition: s.outputNamePosition ?? "suffix",
      maxRetries: s.maxRetries ?? DEFAULT_RETRIES,
      retryDelayMinutes: s.retryDelayMinutes ?? DEFAULT_RETRY_DELAY,
      steps: policy.steps,
    }),
  };
}

/**
 * POST /api/v1/policies/{id}/run — trigger a stored policy immediately. The
 * real endpoint is multipart; the portal sends no files, relying on whatever
 * the backend has queued for this policy.
 */
export async function runPolicy(id: string): Promise<{ runId: string }> {
  return apiClient.local.json<{ runId: string }>(
    `/api/v1/policies/${encodeURIComponent(id)}/run`,
    { method: "POST" },
  );
}
