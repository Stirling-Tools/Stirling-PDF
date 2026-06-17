/**
 * Policies fixtures and the canonical TS model the portal shares with them.
 *
 * The model mirrors the editor + backend policy contract so the portal's
 * "set up a policy" flow is plug-and-play against the real `/api/v1/policies`
 * API. A policy is a stored automation: an ordered chain of tool steps (each
 * step's `operation` is a Stirling endpoint path) plus an output destination,
 * fired automatically by a trigger (editor upload/export) over a set of
 * sources. The catalogue groups policies by category, each category carrying a
 * `PolicyConfigDef` (summary, rules, fields, default tool chain) the setup flow
 * builds from.
 *
 * The wire types (`Policy`, `PipelineStep`) match the backend records exactly;
 * the catalogue + decorated state shapes (`PolicyConfigDef`, `PolicyField`,
 * `PolicyState`, …) are lifted from the editor's `types/policies.ts`, with
 * ReactNode icons replaced by string icon keys (the portal renders its own).
 *
 * api/policies.ts re-exports these types; the MSW handlers serve the fixture
 * data over intercepted httpJson() calls. Components never reach in here.
 */

/* ──────────────────────────────────────────────────────────────────────── */
/*  Backend wire model — matches Policy.java / PipelineStep.java exactly      */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * A single tool invocation in a policy's pipeline. `operation` is a Stirling
 * endpoint path (e.g. `/api/v1/security/auto-redact`); `parameters` are the
 * scalar form fields that endpoint accepts. `fileParameters` binds a tool's
 * named file field to an asset key in a run's supporting-file store.
 */
export interface PipelineStep {
  operation: string;
  parameters: Record<string, unknown>;
  fileParameters?: Record<string, string>;
}

/** When a policy fires automatically. A null trigger means manual-only. */
export interface TriggerConfig {
  /** The editor event the policy runs on. */
  event: "upload" | "export";
}

/** Where a policy's documents come from (a connected source). */
export interface InputSpec {
  /** Source id from {@link POLICY_SOURCES}. */
  source: string;
}

/** How a run's result is delivered. */
export interface OutputSpec {
  /** A separate new file, or a new version of the input the policy ran on. */
  mode: "new_file" | "new_version";
  /** Rename rule for the output; empty keeps the input filename. */
  name: string;
  namePosition: "prefix" | "suffix" | "auto-number";
}

/**
 * The stored policy record — the exact JSON body the backend returns from
 * `GET /api/v1/policies` and accepts on `POST /api/v1/policies`. The portal
 * decorates this with catalogue + runtime data for display (see {@link decorate}).
 */
export interface Policy {
  /** Blank on create; the backend assigns one and returns it. */
  id: string;
  name: string;
  /** Server-assigned owner; the client never forges it. */
  owner?: string;
  /** Whether the trigger fires automatically. Pausing flips this. */
  enabled: boolean;
  trigger: TriggerConfig | null;
  sources: InputSpec[];
  steps: PipelineStep[];
  output: OutputSpec;
  /** The category this policy belongs to. Drives catalogue grouping. */
  categoryId: string;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Catalogue model — lifted from editor types/policies.ts                    */
/* ──────────────────────────────────────────────────────────────────────── */

export type PolicyStatus = "default" | "active" | "paused";

/** Derived display status for a card/detail. */
export type PolicyRowStatus = "active" | "paused" | "setup";

/** A configurable field within a policy's settings. */
export type PolicyFieldType = "toggle" | "select" | "chips" | "text";

export interface PolicyField {
  label: string;
  key: string;
  type: PolicyFieldType;
  /** Default value: boolean (toggle), string (select/text), string[] (chips). */
  value: boolean | string | string[];
  /** Options for select/chips. */
  options?: string[];
}

/**
 * Static definition of a policy category. The editor's `icon: ReactNode` is
 * replaced by a string `icon` key the portal resolves to its own glyph.
 */
export interface PolicyCategory {
  id: string;
  label: string;
  /** Icon key the portal renders (not a component — the portal owns glyphs). */
  icon: string;
  /** Visual tone for the category's icon chip. */
  tone: "neutral" | "blue" | "purple" | "green" | "amber" | "red";
  /** Long description shown in the setup flow. */
  desc: string;
  /** Drives the "Set up Classification" affordance (doc-type narrowing). */
  providesClassification?: boolean;
  /** Locked "Coming soon" — can't be opened or configured. */
  comingSoon?: boolean;
}

/** The narrative + field configuration backing a category. */
export interface PolicyConfigDef {
  /** One-line summary of what the policy enforces. */
  summary: string;
  /** Pipeline-like rule chips shown in the "Enforces" section. */
  rules: string[];
  /** Human label for the scope this policy applies to. */
  scopeLabel: string;
  /** Editable policy-level settings fields. */
  fields: PolicyField[];
  /**
   * The preset pipeline a new policy is seeded with — the real, editable tool
   * steps (each `operation` is a Stirling endpoint path, matching the backend's
   * PipelineStep). The setup flow starts from these.
   */
  defaultOperations: PipelineStep[];
}

/** A source a policy can run over (setup "Sources" step). */
export interface PolicySource {
  id: string;
  label: string;
  desc: string;
  /** Icon key the portal renders. */
  icon: string;
}

/** Three-up summary stats shown at the foot of a configured policy's detail. */
export interface PolicyStats {
  /** Documents enforced. */
  enforced: number;
  /** Human-formatted data-processed figure, e.g. "2.3 GB". */
  dataProcessed: string;
  /** Human-formatted active-for figure, e.g. "12d", or "—" when idle. */
  activeFor: string;
}

/** An entry in a policy's recent-activity feed. */
export interface PolicyActivityItem {
  /** Document the policy acted on. */
  doc: string;
  /** What the policy did, e.g. "Redacted 4 PII matches • 2 pages". */
  action: string;
  /** Relative timestamp, e.g. "2h ago". */
  time: string;
  /** "enforced" (clean), "flagged" (needs review), "processing" (running). */
  status: "enforced" | "flagged" | "processing";
}

/**
 * The collected settings the setup flow gathers and the detail panel reads —
 * the editor's `PolicyState`, minus the local-cache bookkeeping (folderId etc).
 */
export interface PolicyState {
  configured: boolean;
  status: PolicyStatus;
  /** Selected sources (ids from {@link POLICY_SOURCES}). */
  sources: string[];
  /** When non-empty, narrows the policy to these document types. */
  scopeTypes: string[];
  /** Email low-confidence enforcements are routed to. */
  reviewerEmail: string;
  /** Saved field values, keyed by field key (overrides the definition default). */
  fieldValues: Record<string, boolean | string | string[]>;
  /** How a run's output is delivered. Defaults to "new_version". */
  outputMode?: "new_file" | "new_version";
  /** Rename rule for the output. Empty keeps the input filename. */
  outputName?: string;
  /** When the policy runs. Defaults to "upload". */
  runOn?: "upload" | "export";
  /** Backend record id once persisted; used to update/delete/run it. */
  backendId?: string;
  /** A shipped catalogue policy (configurable but not deletable). */
  isDefault?: boolean;
}

/** What the setup flow hands back on submit — collected settings + built steps. */
export interface PolicySetupResult {
  fieldValues: Record<string, boolean | string | string[]>;
  sources: string[];
  scopeTypes: string[];
  reviewerEmail: string;
  outputMode: "new_file" | "new_version";
  outputName: string;
  outputNamePosition: "prefix" | "suffix" | "auto-number";
  runOn: "upload" | "export";
  /** The configured tool chain as backend pipeline steps. */
  steps: PipelineStep[];
}

/**
 * A configured policy as the catalogue view consumes it: the wire record plus
 * the catalogue's category/config and derived runtime data. The handlers build
 * this from the in-memory store + fixtures.
 */
export interface DecoratedPolicy {
  category: PolicyCategory;
  config: PolicyConfigDef;
  state: PolicyState;
  /** The policy's configured steps (drives the detail "Enforces" flow). */
  steps: PipelineStep[];
  stats: PolicyStats;
  activity: PolicyActivityItem[];
}

/** Catalogue strip totals shown above the cards. */
export interface PoliciesSummary {
  /** Policies currently active (enabled). */
  active: number;
  /** Policies configured but paused. */
  paused: number;
  /** Categories available to configure. */
  categories: number;
  /** Documents enforced across all active policies. */
  docsEnforced: number;
}

/** The `GET /api/v1/policies` response, in the portal's catalogue shape. */
export interface PoliciesResponse {
  summary: PoliciesSummary;
  /** Every catalogue category, each with its definition + (optional) state. */
  catalogue: CatalogueEntry[];
}

/** One catalogue row: a category, its definition, and its current state. */
export interface CatalogueEntry {
  category: PolicyCategory;
  config: PolicyConfigDef;
  /** The configured policy's runtime view, or null when not yet set up. */
  policy: DecoratedPolicy | null;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Tool → endpoint registry                                                  */
/*  Maps a frontend tool id to its Stirling endpoint path. The setup flow's   */
/*  pipeline steps carry endpoint paths (the backend's PipelineStep contract), */
/*  so this is the seam that keeps the preset chains plug-and-play.            */
/* ──────────────────────────────────────────────────────────────────────── */

export const TOOL_ENDPOINTS: Record<string, string> = {
  redact: "/api/v1/security/auto-redact",
  sanitize: "/api/v1/security/sanitize-pdf",
  watermark: "/api/v1/security/add-watermark",
  ocr: "/api/v1/misc/ocr-pdf",
  flatten: "/api/v1/misc/flatten",
  compress: "/api/v1/misc/compress-pdf",
};

/** A friendly label for an endpoint path (for the detail "Enforces" chips). */
export const ENDPOINT_LABELS: Record<string, string> = {
  "/api/v1/security/auto-redact": "Redact PII",
  "/api/v1/security/sanitize-pdf": "Remove JavaScript",
  "/api/v1/security/add-watermark": "Watermark",
  "/api/v1/misc/ocr-pdf": "OCR",
  "/api/v1/misc/flatten": "Flatten",
  "/api/v1/misc/compress-pdf": "Compress",
};

/** "/api/v1/security/auto-redact" → "Auto Redact" — fallback humanisation. */
export function humanizeEndpoint(path: string): string {
  if (ENDPOINT_LABELS[path]) return ENDPOINT_LABELS[path];
  const last = path.split("/").filter(Boolean).pop() ?? path;
  return last
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Catalogue definitions — categories, configs, sources, doc types          */
/*  Modelled on the editor's policyDefinitions. PII redact regexes are the    */
/*  precise patterns the /auto-redact endpoint matches (wordsToRedact).       */
/* ──────────────────────────────────────────────────────────────────────── */

/** PII regexes seeded into a Security policy's redact step (SSN + cards). */
const DEFAULT_PII_PATTERNS: string[] = [
  "\\b(?!000|666|9\\d{2})\\d{3}([- ])(?!00)\\d{2}\\1(?!0000)\\d{4}\\b", // SSN
  "\\b(?:4\\d{12}(?:\\d{3})?|5[1-5]\\d{14}|3[47]\\d{13}|6(?:011|5\\d{2})\\d{12})\\b", // cards
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
    rules: ["Redact PII", "Remove JavaScript"],
    scopeLabel: "All documents",
    // Default chain: redact PII (flattened to image so text is truly removed) +
    // strip JavaScript. Watermark is offered in the designer but off by default.
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
    ],
    // The tool chain is configured per-tool in the designer (redact / sanitize /
    // watermark); no separate policy-level fields.
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

export const POLICY_SOURCES: PolicySource[] = [
  {
    id: "editor",
    label: "Editor",
    desc: "Documents you save or export in Stirling",
    icon: "file",
  },
  {
    id: "device",
    label: "Entire device",
    desc: "All PDFs on this machine, retroactively",
    icon: "device",
  },
  {
    id: "sharepoint",
    label: "SharePoint",
    desc: "Connected SharePoint libraries",
    icon: "globe",
  },
  {
    id: "dropbox",
    label: "Dropbox",
    desc: "Connected Dropbox folders",
    icon: "cloud",
  },
  {
    id: "gmail",
    label: "Gmail",
    desc: "PDF attachments in email",
    icon: "mail",
  },
  {
    id: "gdrive",
    label: "Google Drive",
    desc: "Connected Drive folders",
    icon: "folder",
  },
];

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
/*  Seed policies — a few configured policies in the wire shape, so the store */
/*  behaves like a backend that already has policies set up.                  */
/* ──────────────────────────────────────────────────────────────────────── */

/** The shipped default policies the handlers seed the store with. */
export function seedPolicies(): Policy[] {
  return [
    {
      id: "pol_security_default",
      name: "Security Policy",
      owner: "security@acme.com",
      enabled: true,
      trigger: { event: "upload" },
      sources: [{ source: "editor" }],
      steps: POLICY_CONFIG.security.defaultOperations,
      output: { mode: "new_version", name: "", namePosition: "suffix" },
      categoryId: "security",
    },
  ];
}

/**
 * Per-policy runtime extras keyed by policy id — the parts the wire record
 * doesn't carry (collected field values, scope, derived stats + activity).
 * In a real backend these would be derived server-side from the user's files.
 */
export interface PolicyRuntime {
  scopeTypes: string[];
  reviewerEmail: string;
  fieldValues: Record<string, boolean | string | string[]>;
  stats: PolicyStats;
  activity: PolicyActivityItem[];
  isDefault?: boolean;
}

export function seedRuntime(): Record<string, PolicyRuntime> {
  return {
    pol_security_default: {
      scopeTypes: [],
      reviewerEmail: "security@acme.com",
      fieldValues: {},
      isDefault: true,
      stats: { enforced: 4821, dataProcessed: "2.3 GB", activeFor: "34d" },
      activity: [
        {
          doc: "Q2-vendor-agreement.pdf",
          action: "Redacted 6 PII matches • JavaScript stripped",
          time: "12m ago",
          status: "enforced",
        },
        {
          doc: "patient-intake-0481.pdf",
          action: "Low-confidence match — routed for review",
          time: "1h ago",
          status: "flagged",
        },
        {
          doc: "invoice-7782.pdf",
          action: "Enforcing…",
          time: "just now",
          status: "processing",
        },
      ],
    },
  };
}

/** Empty stats/activity for a freshly-configured policy with no runs yet. */
export function emptyRuntime(reviewerEmail = "you@acme.com"): PolicyRuntime {
  return {
    scopeTypes: [],
    reviewerEmail,
    fieldValues: {},
    stats: { enforced: 0, dataProcessed: "0 B", activeFor: "—" },
    activity: [],
  };
}
