/**
 * Policies fixtures and the types api/policies.ts shares with them.
 *
 * A "policy" is an org-wide standing rule that governs how every document is
 * handled — independent of which developer pipeline processes it. There are
 * exactly five fixed categories (Ingestion, Security, Compliance, Routing,
 * Retention); each carries a global default config plus per-document-type
 * overrides. Buyers/admins own these; developers own Pipelines.
 *
 * api/policies.ts imports the types; the MSW handlers serve the fixture data
 * over the intercepted httpJson() calls. Components never reach into this
 * module directly. Once a real backend exists the handlers stop being
 * registered and these fixtures can be deleted (or kept as test seeds).
 */

import type { Tier } from "@portal/contexts/TierContext";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Categories                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

/** The five fixed policy categories. The set is closed — not user-extensible. */
export type PolicyCategory =
  | "ingestion"
  | "security"
  | "compliance"
  | "routing"
  | "retention";

export const POLICY_CATEGORIES: PolicyCategory[] = [
  "ingestion",
  "security",
  "compliance",
  "routing",
  "retention",
];

/**
 * Each category's config is a flat bag of typed fields. Field kinds map to a
 * single SUI control in the designer, so the form renders generically without a
 * bespoke component per category.
 */
export type PolicyFieldKind = "toggle" | "select" | "number" | "text";

export interface PolicyFieldOption {
  value: string;
  label: string;
}

export interface PolicyField {
  key: string;
  label: string;
  kind: PolicyFieldKind;
  /** Current value. Booleans for toggles, strings/numbers otherwise. */
  value: string | number | boolean;
  /** Choices for `select` fields. */
  options?: PolicyFieldOption[];
  /** One-line help shown under the control. */
  help?: string;
  /** Unit suffix for `number` fields, e.g. "days", "MB". */
  unit?: string;
}

/** A per-document-type deviation from the global default. */
export interface PolicyOverride {
  /** Document type this override applies to, e.g. "Invoices". */
  docType: string;
  /** Human-readable summary of how this type deviates from the default. */
  rule: string;
}

export interface PolicyCategoryConfig {
  category: PolicyCategory;
  enabled: boolean;
  /** One-line summary of the active global rule, shown on the card. */
  summary: string;
  /** Editable global-default fields surfaced in the designer. */
  fields: PolicyField[];
  /** Per-document-type overrides layered on top of the global default. */
  overrides: PolicyOverride[];
  lastEditedBy: string;
  /** Relative-time string, e.g. "3 days ago". */
  lastEditedAt: string;
  /**
   * Minimum tier that can edit this category. Categories above the active tier
   * render locked with an upgrade nudge.
   */
  requiredTier: Tier;
}

export interface PoliciesSummary {
  /** Categories currently enabled out of the five. */
  activePolicies: number;
  totalCategories: number;
  /** Distinct document types covered by at least one override. */
  docTypesCovered: number;
  /** Relative-time string for the most recent change across all categories. */
  lastChange: string;
  /** Who made the most recent change. */
  lastChangeBy: string;
}

export interface PoliciesResponse {
  summary: PoliciesSummary;
  categories: PolicyCategoryConfig[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Per-category presentation metadata (icon + tone + label)                 */
/*  Lives client-side — it's product copy, not data. Re-exported for the     */
/*  view via api/policies.ts.                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

export interface PolicyCategoryMeta {
  label: string;
  icon: string;
  tone: "neutral" | "blue" | "purple" | "green" | "amber" | "red";
  /** What the category governs, shown under the card title. */
  blurb: string;
}

export const POLICY_CATEGORY_META: Record<PolicyCategory, PolicyCategoryMeta> =
  {
    ingestion: {
      label: "Ingestion",
      icon: "⭳",
      tone: "blue",
      blurb: "What documents are accepted and how they enter",
    },
    security: {
      label: "Security",
      icon: "🛡",
      tone: "purple",
      blurb: "Encryption, redaction and access controls",
    },
    compliance: {
      label: "Compliance",
      icon: "§",
      tone: "amber",
      blurb: "Regulatory frameworks and attestations",
    },
    routing: {
      label: "Routing",
      icon: "⇉",
      tone: "green",
      blurb: "Which pipeline handles which document",
    },
    retention: {
      label: "Retention",
      icon: "⏲",
      tone: "neutral",
      blurb: "How long documents and outputs are kept",
    },
  };

/* ──────────────────────────────────────────────────────────────────────── */
/*  Fixture builders                                                         */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Free tier may only edit the two foundational categories; the rest are shown
 * locked. Pro unlocks everything operational; Compliance is gated to
 * enterprise where attestations and frameworks become relevant.
 */
const REQUIRED_TIER: Record<PolicyCategory, Tier> = {
  ingestion: "free",
  retention: "free",
  routing: "pro",
  security: "pro",
  compliance: "enterprise",
};

function ingestionConfig(tier: Tier): PolicyCategoryConfig {
  return {
    category: "ingestion",
    enabled: true,
    summary: "Accept PDF, DOCX, PNG up to 50 MB · reject password-protected",
    requiredTier: REQUIRED_TIER.ingestion,
    lastEditedBy: "you@acme.com",
    lastEditedAt: "3 days ago",
    fields: [
      {
        key: "maxSizeMb",
        label: "Maximum file size",
        kind: "number",
        value: 50,
        unit: "MB",
        help: "Documents above this size are rejected at intake.",
      },
      {
        key: "allowedTypes",
        label: "Accepted formats",
        kind: "select",
        value: "pdf-office-image",
        options: [
          { value: "pdf-only", label: "PDF only" },
          { value: "pdf-office", label: "PDF + Office" },
          { value: "pdf-office-image", label: "PDF + Office + Images" },
          { value: "any", label: "Any document type" },
        ],
        help: "Formats accepted across every source.",
      },
      {
        key: "rejectEncrypted",
        label: "Reject password-protected files",
        kind: "toggle",
        value: true,
        help: "Encrypted PDFs are bounced rather than queued for a password.",
      },
      {
        key: "virusScan",
        label: "Virus scan on intake",
        kind: "toggle",
        value: tier === "enterprise",
        help: "Hold documents until an AV pass clears them.",
      },
    ],
    overrides: [
      { docType: "Invoices", rule: "Allow up to 100 MB for scanned batches" },
      { docType: "Legal contracts", rule: "PDF only · reject images" },
    ],
  };
}

function retentionConfig(tier: Tier): PolicyCategoryConfig {
  const days = tier === "enterprise" ? 2555 : 365;
  return {
    category: "retention",
    enabled: true,
    summary:
      tier === "enterprise"
        ? "Keep originals 7 years · purge derived artifacts after 90 days"
        : "Keep documents 365 days · purge derived artifacts after 30 days",
    requiredTier: REQUIRED_TIER.retention,
    lastEditedBy: "compliance@acme.com",
    lastEditedAt: "2 weeks ago",
    fields: [
      {
        key: "retainDays",
        label: "Retain originals",
        kind: "number",
        value: days,
        unit: "days",
        help: "Source documents are deleted after this window.",
      },
      {
        key: "purgeDerivedDays",
        label: "Purge derived artifacts",
        kind: "number",
        value: tier === "enterprise" ? 90 : 30,
        unit: "days",
        help: "Extractions, redaction masks and thumbnails expire sooner.",
      },
      {
        key: "legalHold",
        label: "Honor legal holds",
        kind: "toggle",
        value: true,
        help: "Suspend deletion for documents under an active hold.",
      },
      {
        key: "purgeMode",
        label: "Deletion method",
        kind: "select",
        value: tier === "enterprise" ? "crypto-shred" : "soft-delete",
        options: [
          { value: "soft-delete", label: "Soft delete (recoverable 30d)" },
          { value: "hard-delete", label: "Hard delete" },
          { value: "crypto-shred", label: "Crypto-shred (key destruction)" },
        ],
      },
    ],
    overrides: [
      { docType: "Tax records", rule: "Retain 7 years regardless of default" },
      { docType: "Drafts", rule: "Purge after 30 days" },
    ],
  };
}

function routingConfig(): PolicyCategoryConfig {
  return {
    category: "routing",
    enabled: true,
    summary: "Default pipeline: Redact & Flatten · classify before routing",
    requiredTier: REQUIRED_TIER.routing,
    lastEditedBy: "platform@acme.com",
    lastEditedAt: "5 days ago",
    fields: [
      {
        key: "defaultPipeline",
        label: "Default pipeline",
        kind: "select",
        value: "redact-flatten",
        options: [
          { value: "redact-flatten", label: "Redact & Flatten" },
          { value: "ocr-index", label: "OCR & Index" },
          { value: "passthrough", label: "Passthrough (no processing)" },
        ],
        help: "Applied when no override or classifier match is found.",
      },
      {
        key: "classifyFirst",
        label: "Classify before routing",
        kind: "toggle",
        value: true,
        help: "Run the document classifier to pick a pipeline by content.",
      },
      {
        key: "onUnclassified",
        label: "When classification is uncertain",
        kind: "select",
        value: "default-pipeline",
        options: [
          { value: "default-pipeline", label: "Use default pipeline" },
          { value: "manual-review", label: "Send to manual review" },
          { value: "reject", label: "Reject document" },
        ],
      },
    ],
    overrides: [
      { docType: "Invoices", rule: "Route to Invoice v3" },
      { docType: "KYC documents", rule: "Route to KYC Onboarding" },
      { docType: "Contracts", rule: "Route to Contract Review" },
    ],
  };
}

function securityConfig(tier: Tier): PolicyCategoryConfig {
  return {
    category: "security",
    enabled: true,
    summary: "Encrypt at rest (AES-256) · auto-redact PII · region-locked",
    requiredTier: REQUIRED_TIER.security,
    lastEditedBy: "security@acme.com",
    lastEditedAt: "yesterday",
    fields: [
      {
        key: "encryptAtRest",
        label: "Encrypt documents at rest",
        kind: "toggle",
        value: true,
        help: "AES-256 envelope encryption on stored originals and outputs.",
      },
      {
        key: "autoRedactPii",
        label: "Auto-redact detected PII",
        kind: "toggle",
        value: true,
        help: "Mask SSNs, card numbers and contact details on processed copies.",
      },
      {
        key: "dataRegion",
        label: "Processing region",
        kind: "select",
        value: "us-east-1",
        options: [
          { value: "us-east-1", label: "US East (Virginia)" },
          { value: "eu-west-1", label: "EU West (Ireland)" },
          { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
        ],
        help: "Documents never leave this region during processing.",
      },
      {
        key: "keyManagement",
        label: "Encryption keys",
        kind: "select",
        value: tier === "enterprise" ? "cmk" : "platform",
        options: [
          { value: "platform", label: "Platform-managed" },
          { value: "cmk", label: "Customer-managed (BYOK)" },
        ],
      },
    ],
    overrides: [
      { docType: "Medical records", rule: "EU West region · BYOK required" },
      { docType: "Public filings", rule: "Skip auto-redaction" },
    ],
  };
}

function complianceConfig(): PolicyCategoryConfig {
  return {
    category: "compliance",
    enabled: true,
    summary: "SOC 2 + HIPAA attested · audit trail on every document",
    requiredTier: REQUIRED_TIER.compliance,
    lastEditedBy: "compliance@acme.com",
    lastEditedAt: "1 month ago",
    fields: [
      {
        key: "frameworks",
        label: "Active framework",
        kind: "select",
        value: "soc2-hipaa",
        options: [
          { value: "soc2", label: "SOC 2 Type II" },
          { value: "soc2-hipaa", label: "SOC 2 + HIPAA" },
          { value: "soc2-hipaa-gdpr", label: "SOC 2 + HIPAA + GDPR" },
        ],
        help: "Drives required controls, attestations and audit retention.",
      },
      {
        key: "auditTrail",
        label: "Immutable audit trail",
        kind: "toggle",
        value: true,
        help: "Append-only log of every access and transformation.",
      },
      {
        key: "requireAttestation",
        label: "Require processor attestation",
        kind: "toggle",
        value: true,
        help: "Each pipeline must carry a signed data-processing attestation.",
      },
      {
        key: "dpaContact",
        label: "Data protection officer",
        kind: "text",
        value: "dpo@acme.com",
        help: "Notified on policy breaches and subject-access requests.",
      },
    ],
    overrides: [
      { docType: "Health forms", rule: "HIPAA · 7-year audit retention" },
      { docType: "EU customer data", rule: "GDPR · right-to-erasure enabled" },
    ],
  };
}

/**
 * The full category set for a tier. Every category is always present so the
 * five cards render consistently; tier only governs which are editable
 * (`requiredTier`) and the values inside enterprise-sensitive fields.
 */
export function categoriesFor(tier: Tier): PolicyCategoryConfig[] {
  return [
    ingestionConfig(tier),
    securityConfig(tier),
    complianceConfig(),
    routingConfig(),
    retentionConfig(tier),
  ];
}

export function summaryFor(tier: Tier): PoliciesSummary {
  const categories = categoriesFor(tier);
  const editable = categories.filter((c) =>
    tierMeetsRequirement(tier, c.requiredTier),
  );
  const activePolicies = editable.filter((c) => c.enabled).length;
  const docTypes = new Set(
    editable.flatMap((c) => c.overrides.map((o) => o.docType)),
  );
  return {
    activePolicies,
    totalCategories: categories.length,
    docTypesCovered: docTypes.size,
    lastChange: "yesterday",
    lastChangeBy: "security@acme.com",
  };
}

export function buildPoliciesResponse(tier: Tier): PoliciesResponse {
  return { summary: summaryFor(tier), categories: categoriesFor(tier) };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Tier helpers                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, enterprise: 2 };

/** True when `active` is at or above the `required` tier. */
export function tierMeetsRequirement(active: Tier, required: Tier): boolean {
  return TIER_RANK[active] >= TIER_RANK[required];
}
