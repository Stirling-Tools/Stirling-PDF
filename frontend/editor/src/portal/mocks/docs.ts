/**
 * Developer Docs fixtures. Types live in api/docs.ts (the backend contract);
 * this module only builds fake data for Storybook and tests.
 *
 * Two payloads back the surface:
 *   - the left-hand nav tree (`buildDocsNav`), and
 *   - the data-driven reference content (`docsContentFor`) — code samples,
 *     SDK matrix, embeddable components, playbooks, agent skills, the error
 *     table, and the tier-scaled rate-limit grid.
 *
 * Rate limits scale with plan: free is throttled hard, pro lifts the ceiling,
 * enterprise is negotiated ("Custom"). The rest of the content is tier-neutral.
 */

import type { Tier } from "@portal/contexts/TierContext";
import type {
  AgentSkill,
  ApiErrorRow,
  CodeSample,
  DocsContent,
  DocsNavSection,
  EmbedComponent,
  Playbook,
  RateLimit,
  Sdk,
} from "@portal/api/docs";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Navigation                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

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
    accent: "default",
  },
  {
    title: "PII redaction at scale",
    blurb:
      "Sweep a document set for PII and write redacted copies to cold storage.",
    steps: ["S3 source", "Detect PII", "Redact", "Store to bucket"],
    accent: "premium",
  },
  {
    title: "Compliance evidence pack",
    blurb:
      "Bundle SOC 2 and audit reports into a verified, timestamped archive.",
    steps: ["Batch upload", "Classify", "Validate schema", "Sign & archive"],
    accent: "success",
  },
  {
    title: "Agent document tool",
    blurb:
      "Expose extraction as an MCP tool your agent can call deterministically.",
    steps: ["Define tool", "Bind endpoint", "Run evals", "Ship to agent"],
    accent: "premium",
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
