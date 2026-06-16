/**
 * Getting Started fixtures and the types api/gettingStarted.ts shares with them.
 *
 * The onboarding funnel walks a new developer from picking a use case, through
 * a simulated document analysis, to a live API key + copy-paste snippets. The
 * catalogue (use cases, sample key, snippets) is tier-aware: higher tiers see
 * more verticals and a higher rate limit baked into the snippets.
 *
 * api/gettingStarted.ts imports the types; the MSW handlers serve this fixture
 * data over intercepted httpJson() calls. Components never reach in directly.
 */

import type { Tier } from "@portal/contexts/TierContext";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Use-case catalogue (step 1)                                              */
/* ──────────────────────────────────────────────────────────────────────── */

export type UseCaseAccent = "blue" | "purple" | "green" | "amber" | "red";

export interface UseCase {
  id: string;
  /** Short category tag shown above the title. */
  eyebrow: string;
  title: string;
  blurb: string;
  /** Pipeline this use case maps to — surfaced in later steps. */
  pipeline: string;
  accent: UseCaseAccent;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Analysis sequence (step 2)                                               */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * The simulated analysis steps the dropzone walks through after a document is
 * dropped. The view advances these on local timers — the catalogue ships the
 * labels/copy so the backend can later return a real per-step result set
 * without the client hard-coding stage names.
 */
export interface AnalysisStage {
  id: string;
  label: string;
  /** One-line description of what this stage checks. */
  detail: string;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Go-live snippets (step 3)                                                */
/* ──────────────────────────────────────────────────────────────────────── */

export type SnippetLang = "python" | "node" | "curl";

export interface CodeSnippet {
  lang: SnippetLang;
  label: string;
  code: string;
}

export interface GettingStartedResponse {
  useCases: UseCase[];
  stages: AnalysisStage[];
  /** Sample key revealed on the go-live step — never a real secret. */
  sampleKey: string;
  snippets: CodeSnippet[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Fixtures                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

const BASE_USE_CASES: UseCase[] = [
  {
    id: "coi",
    eyebrow: "COMPLIANCE",
    title: "COI Compliance",
    blurb:
      "Read certificates of insurance, check coverage against requirements, and flag gaps before they reach a human.",
    pipeline: "COI Compliance",
    accent: "blue",
  },
  {
    id: "invoice",
    eyebrow: "ACCOUNTS PAYABLE",
    title: "Accounts Payable / Invoice",
    blurb:
      "Extract line items, totals, and remit-to details from invoices and route them straight into your AP workflow.",
    pipeline: "Invoice v3",
    accent: "green",
  },
  {
    id: "contract",
    eyebrow: "LEGAL",
    title: "Contract Review",
    blurb:
      "Surface clauses, parties, and renewal dates from contracts; escalate anything outside policy for review.",
    pipeline: "Contract Review",
    accent: "purple",
  },
  {
    id: "prior-auth",
    eyebrow: "HEALTHCARE",
    title: "Prior Authorization",
    blurb:
      "Parse prior-auth requests and supporting records, match against payer rules, and assemble the decision packet.",
    pipeline: "Prior Auth Intake",
    accent: "amber",
  },
  {
    id: "kyc",
    eyebrow: "ONBOARDING",
    title: "KYC",
    blurb:
      "Verify identity documents, redact PII, and produce an auditable onboarding record for every applicant.",
    pipeline: "KYC Onboarding",
    accent: "red",
  },
];

/** Enterprise unlocks an extra cross-cutting vertical on the picker. */
const ENTERPRISE_EXTRA_USE_CASES: UseCase[] = [
  {
    id: "claims",
    eyebrow: "INSURANCE",
    title: "Claims Intake",
    blurb:
      "Classify mixed claims packets, split by document type, and route each part to the right downstream pipeline.",
    pipeline: "Claims Router",
    accent: "blue",
  },
];

/**
 * Deterministic analysis sequence — the same five checks for every tier so the
 * stepper reads identically regardless of plan. The view owns the timing.
 */
const ANALYSIS_STAGES: AnalysisStage[] = [
  {
    id: "detect",
    label: "Detect document type",
    detail: "Classifying layout and matching against known templates.",
  },
  {
    id: "pii",
    label: "Scan for PII",
    detail: "Locating names, IDs, and other sensitive fields.",
  },
  {
    id: "extract",
    label: "Evaluate extraction",
    detail: "Pulling structured fields and scoring confidence.",
  },
  {
    id: "compress",
    label: "Check compression",
    detail: "Estimating size reduction without quality loss.",
  },
  {
    id: "assemble",
    label: "Assemble pipeline",
    detail: "Wiring the steps into a runnable pipeline for this use case.",
  },
];

/** Rate-limit baked into the snippet comments, scaled by tier. */
function rateLimitFor(tier: Tier): string {
  if (tier === "enterprise") return "custom (contact sales)";
  if (tier === "pro") return "600 req/min";
  return "60 req/min";
}

function snippetsFor(tier: Tier, sampleKey: string): CodeSnippet[] {
  const limit = rateLimitFor(tier);
  return [
    {
      lang: "python",
      label: "Python",
      code: `# pip install stirling-sdk — rate limit: ${limit}
from stirling import Stirling

client = Stirling(api_key="${sampleKey}")

with open("invoice.pdf", "rb") as f:
    result = client.extract(file=f, pipeline="invoice-v3")

print(result.fields)`,
    },
    {
      lang: "node",
      label: "Node",
      code: `// npm install @stirling/sdk — rate limit: ${limit}
import { Stirling } from "@stirling/sdk";
import { readFileSync } from "node:fs";

const client = new Stirling({ apiKey: "${sampleKey}" });

const result = await client.extract({
  file: readFileSync("invoice.pdf"),
  pipeline: "invoice-v3",
});

console.log(result.fields);`,
    },
    {
      lang: "curl",
      label: "cURL",
      code: `# rate limit: ${limit}
curl https://api.stirlingpdf.com/v1/extract \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -F "file=@invoice.pdf" \\
  -F "pipeline=invoice-v3"`,
    },
  ];
}

export function useCasesFor(tier: Tier): UseCase[] {
  return tier === "enterprise"
    ? [...BASE_USE_CASES, ...ENTERPRISE_EXTRA_USE_CASES]
    : BASE_USE_CASES;
}

export function buildGettingStartedResponse(
  tier: Tier,
): GettingStartedResponse {
  // Sandbox keys are tier-prefixed so a dev can eyeball which plan answered.
  const sampleKey = `sk_test_${tier}_0a1b2c3d4e5f6789`;
  return {
    useCases: useCasesFor(tier),
    stages: ANALYSIS_STAGES,
    sampleKey,
    snippets: snippetsFor(tier, sampleKey),
  };
}
