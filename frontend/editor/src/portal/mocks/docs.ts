/**
 * Developer Docs fixtures and the types api/docs.ts shares with them.
 * api/docs.ts imports the types; the MSW handlers in mocks/handlers/ serve the
 * fixture data over the intercepted apiClient.local.json() calls. Components never reach
 * into this module directly.
 *
 * Two payloads back the surface:
 *   - the left-hand nav tree (`buildDocsNav`), and
 *   - the data-driven reference content (`docsContentFor`) — code samples,
 *     SDK matrix, embeddable components, playbooks, agent skills, the error
 *     table, and the tier-scaled rate-limit grid.
 *
 * Rate limits scale with plan: free is throttled hard, pro lifts the ceiling,
 * enterprise is negotiated ("Custom"). The rest of the content is tier-neutral.
 *
 * Once a real backend exists the MSW handlers stop being registered and these
 * fixtures can be deleted (or kept as test seeds).
 */

import type { Tier } from "@portal/contexts/TierContext";
import type { CodeLang } from "@shared/components";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Navigation                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

/** A leaf entry in the docs nav — maps 1:1 to a content section. */
export interface DocsNavItem {
  /** Stable id used as the in-page section anchor. */
  id: string;
  label: string;
  /** Optional badge shown to the right of the label (e.g. "New", "Beta"). */
  badge?: string;
}

/** A top-level grouping in the docs nav tree. */
export interface DocsNavSection {
  id: string;
  label: string;
  /** Single-glyph icon shown beside the section header. */
  icon: string;
  items: DocsNavItem[];
}

export function buildDocsNav(): DocsNavSection[] {
  return [
    {
      id: "getting-started",
      label: "Getting Started",
      icon: "▶",
      items: [
        { id: "quickstart", label: "Quickstart" },
        { id: "authentication", label: "Authentication" },
        { id: "rate-limits", label: "Rate limits & quotas" },
      ],
    },
    {
      id: "api-reference",
      label: "API Reference",
      icon: "{ }",
      items: [
        { id: "endpoints", label: "Endpoints" },
        { id: "errors", label: "Errors" },
        { id: "webhooks", label: "Webhooks", badge: "Beta" },
      ],
    },
    {
      id: "sdks",
      label: "SDKs",
      icon: "◇",
      items: [{ id: "sdk-overview", label: "Official SDKs" }],
    },
    {
      id: "components",
      label: "Components",
      icon: "▤",
      items: [{ id: "component-library", label: "Drop-in viewers" }],
    },
    {
      id: "playbooks",
      label: "Playbooks",
      icon: "✦",
      items: [{ id: "recipes", label: "Recipes" }],
    },
    {
      id: "skills",
      label: "Skills",
      icon: "✷",
      items: [{ id: "skill-catalog", label: "Agent skills", badge: "New" }],
    },
  ];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Reference content                                                        */
/* ──────────────────────────────────────────────────────────────────────── */

/** One tab in a multi-language code snippet. */
export interface CodeSample {
  /** Stable key used as the snippet tab id. */
  key: string;
  label: string;
  lang: CodeLang;
  code: string;
}

/** Per-tier request ceilings rendered by the rate-limits section. */
export interface RateLimit {
  rpm: string;
  burst: string;
  concurrency: string;
}

/** A single HTTP status row in the error table. */
export interface ApiErrorRow {
  code: string;
  /** Severity colour — amber for recoverable, red for hard failures. */
  tone: "amber" | "red";
  meaning: string;
}

export type SdkStatus = "ga" | "beta" | "deprecated";

/** An official client library in the SDK matrix. */
export interface Sdk {
  name: string;
  /** Single-glyph icon shown beside the name. */
  icon: string;
  install: string;
  lang: CodeLang;
  status: SdkStatus;
}

/** An embeddable UI component in the drop-in viewer library. */
export interface EmbedComponent {
  name: string;
  blurb: string;
  /** Stack tag, e.g. "React" or "Web". */
  tag: string;
}

/** A copy-paste, end-to-end pipeline recipe. */
export interface Playbook {
  title: string;
  blurb: string;
  /** Ordered stages rendered as a chip flow. */
  steps: string[];
  accent: "blue" | "purple" | "green";
}

/** A bundled, named agent capability — a deterministic op chain. */
export interface AgentSkill {
  name: string;
  blurb: string;
  /** Op chain shown as a mono string, e.g. "extract · validate". */
  ops: string;
}

/** The complete data-driven docs payload for one tier. */
export interface DocsContent {
  quickstartSamples: CodeSample[];
  quickstartResponse: string;
  rateLimit: RateLimit;
  errors: ApiErrorRow[];
  sdks: Sdk[];
  components: EmbedComponent[];
  playbooks: Playbook[];
  skills: AgentSkill[];
}

const QUICKSTART_SAMPLES: CodeSample[] = [
  {
    key: "curl",
    label: "cURL",
    lang: "bash",
    code: `curl https://api.stirlingpdf.com/v1/invoice \\
  -H "Authorization: Bearer $STIRLING_API_KEY" \\
  -F "file=@invoice.pdf"`,
  },
  {
    key: "python",
    label: "Python",
    lang: "python",
    code: `from stirling import Stirling

client = Stirling(api_key="sk_live_...")

result = client.extract(
    endpoint="/v1/invoice",
    file=open("invoice.pdf", "rb"),
)
print(result.fields["total"])`,
  },
  {
    key: "node",
    label: "Node",
    lang: "typescript",
    code: `import { Stirling } from "@stirling/sdk";

const client = new Stirling({ apiKey: process.env.STIRLING_API_KEY });

const result = await client.extract({
  endpoint: "/v1/invoice",
  file: await fs.readFile("invoice.pdf"),
});
console.log(result.fields.total);`,
  },
];

const QUICKSTART_RESPONSE = `{
  "endpoint": "/v1/invoice",
  "confidence": 0.98,
  "fields": {
    "vendor_name": "Northwind Traders",
    "invoice_number": "INV-20418",
    "date": "2026-05-31",
    "total": 4820.00,
    "payment_terms": "Net 30"
  },
  "pages": 2,
  "latency_ms": 412
}`;

const RATE_LIMITS: Record<Tier, RateLimit> = {
  free: { rpm: "60 / min", burst: "10", concurrency: "2" },
  pro: { rpm: "1,200 / min", burst: "200", concurrency: "25" },
  enterprise: { rpm: "Custom", burst: "Custom", concurrency: "Custom" },
};

const ERRORS: ApiErrorRow[] = [
  {
    code: "400",
    tone: "amber",
    meaning: "Malformed request or unsupported file type.",
  },
  { code: "401", tone: "red", meaning: "Missing or invalid API key." },
  {
    code: "402",
    tone: "amber",
    meaning: "Quota exhausted — upgrade or wait for reset.",
  },
  { code: "422", tone: "amber", meaning: "Document failed schema validation." },
  { code: "429", tone: "amber", meaning: "Rate limited. Honour Retry-After." },
  {
    code: "500",
    tone: "red",
    meaning: "Internal error — safe to retry with backoff.",
  },
];

const SDKS: Sdk[] = [
  {
    name: "Python",
    icon: "🐍",
    install: "pip install stirling",
    lang: "bash",
    status: "ga",
  },
  {
    name: "Node / TypeScript",
    icon: "⬢",
    install: "npm install @stirling/sdk",
    lang: "bash",
    status: "ga",
  },
  {
    name: "Go",
    icon: "◉",
    install: "go get github.com/stirling/stirling-go",
    lang: "bash",
    status: "ga",
  },
  {
    name: "Ruby",
    icon: "◆",
    install: "gem install stirling",
    lang: "bash",
    status: "ga",
  },
  {
    name: "Java",
    icon: "☕",
    install: "implementation 'com.stirling:sdk:1.x'",
    lang: "bash",
    status: "ga",
  },
  {
    name: ".NET",
    icon: "◈",
    install: "dotnet add package Stirling",
    lang: "bash",
    status: "beta",
  },
  // PHP client predates the typed-response rewrite; pinned, no new endpoints.
  {
    name: "PHP",
    icon: "🐘",
    install: "composer require stirling/stirling-php:^0.9",
    lang: "bash",
    status: "deprecated",
  },
];

const COMPONENTS: EmbedComponent[] = [
  {
    name: "<DocumentViewer />",
    blurb:
      "Render any extracted document with field overlays and confidence highlighting.",
    tag: "React",
  },
  {
    name: "<UploadDropzone />",
    blurb:
      "Drag-and-drop ingestion with client-side type detection and progress.",
    tag: "React",
  },
  {
    name: "<SchemaTable />",
    blurb: "Editable table bound to an endpoint schema with inline validation.",
    tag: "React",
  },
  {
    name: "Web component",
    blurb: "<stirling-viewer> custom element for non-React stacks.",
    tag: "Web",
  },
];

const PLAYBOOKS: Playbook[] = [
  {
    title: "Invoice → ERP sync",
    blurb:
      "Extract invoices from an inbox and post matched line items to your ledger.",
    steps: [
      "Email source",
      "Extract /v1/invoice",
      "Three-way match",
      "POST to ERP",
    ],
    accent: "blue",
  },
  {
    title: "PII redaction at scale",
    blurb:
      "Sweep a document set for PII and write redacted copies to cold storage.",
    steps: ["S3 source", "Detect PII", "Redact", "Store to bucket"],
    accent: "purple",
  },
  {
    title: "Compliance evidence pack",
    blurb:
      "Bundle SOC 2 and audit reports into a verified, timestamped archive.",
    steps: ["Batch upload", "Classify", "Validate schema", "Sign & archive"],
    accent: "green",
  },
  {
    title: "Agent document tool",
    blurb:
      "Expose extraction as an MCP tool your agent can call deterministically.",
    steps: ["Define tool", "Bind endpoint", "Run evals", "Ship to agent"],
    accent: "purple",
  },
];

const SKILLS: AgentSkill[] = [
  {
    name: "Extract & validate",
    blurb:
      "Pull structured fields and enforce the endpoint schema in one call.",
    ops: "extract · validate",
  },
  {
    name: "PII sweep",
    blurb:
      "Detect and redact personal data before a document leaves your tenant.",
    ops: "detect-pii · redact",
  },
  {
    name: "Trust & verify",
    blurb:
      "Check signatures, hashes, and tamper evidence on inbound documents.",
    ops: "verify-signature · checksum",
  },
  {
    name: "Compliance pack",
    blurb:
      "Classify, validate, and archive regulatory documents with an audit trail.",
    ops: "classify · validate · archive",
  },
  {
    name: "Format prep",
    blurb: "Normalise scans — deskew, OCR, and split — ahead of extraction.",
    ops: "ocr · deskew · split",
  },
  {
    name: "Summarise",
    blurb: "Generate a grounded summary with citations back to source pages.",
    ops: "summarise",
  },
];

/** The data-driven docs content for a tier — only rate limits vary by plan. */
export function docsContentFor(tier: Tier): DocsContent {
  return {
    quickstartSamples: QUICKSTART_SAMPLES,
    quickstartResponse: QUICKSTART_RESPONSE,
    rateLimit: RATE_LIMITS[tier],
    errors: ERRORS,
    sdks: SDKS,
    components: COMPONENTS,
    playbooks: PLAYBOOKS,
    skills: SKILLS,
  };
}
