/**
 * Mock op catalogue + canned operation results for the single-op runner.
 * Only api/ops.ts imports from this file.
 */

export type OpResultMap = Record<string, unknown>;

export interface FeaturedOp {
  id: string;
  label: string;
  endpoint: string;
  accent: "blue" | "purple" | "green" | "amber" | "red";
  /** Shown in the picker — short single line. */
  blurb: string;
}

export const FEATURED_OPS: FeaturedOp[] = [
  {
    id: "extract",
    label: "Extract",
    endpoint: "/v1/extract",
    accent: "blue",
    blurb: "Pull structured fields into a typed schema",
  },
  {
    id: "redact",
    label: "Redact PII",
    endpoint: "/v1/redact",
    accent: "red",
    blurb: "Mask SSN, DOB, addresses, accounts before storage",
  },
  {
    id: "classify",
    label: "Classify",
    endpoint: "/v1/classify",
    accent: "purple",
    blurb: "Identify document type with a confidence score",
  },
  {
    id: "ocr",
    label: "OCR",
    endpoint: "/v1/ocr",
    accent: "green",
    blurb: "Text-recognize scanned or image pages",
  },
  {
    id: "validate",
    label: "Schema validate",
    endpoint: "/v1/validate",
    accent: "blue",
    blurb: "Check fields, rules, and coverage against the schema",
  },
  {
    id: "sign-output",
    label: "Sign output",
    endpoint: "/v1/sign",
    accent: "green",
    blurb: "Tamper-evident signature over artifact + run metadata",
  },
  {
    id: "authenticity",
    label: "Authenticity",
    endpoint: "/v1/authenticity",
    accent: "blue",
    blurb: "Verify issuer signature, watermark, and metadata",
  },
  {
    id: "tamper-check",
    label: "Tamper check",
    endpoint: "/v1/tamper-check",
    accent: "amber",
    blurb: "Detect modifications since signing or last-known-good state",
  },
  {
    id: "encrypt-rest",
    label: "Encrypt at rest",
    endpoint: "/v1/encrypt",
    accent: "purple",
    blurb: "AES-256 with Stirling-managed, BYOK, or HYOK keys",
  },
  {
    id: "smart-redact",
    label: "Smart redact",
    endpoint: "/v1/smart-redact",
    accent: "red",
    blurb: "Schema-aware redaction with confidence gating",
  },
];

/** Canned JSON for each featured op's runner "done" state. */
export const OP_RESULTS: Record<string, OpResultMap> = {
  extract: {
    schema: "coi.v2",
    fields: {
      carrier: "Travelers Casualty",
      policy_number: "PHB-1108-2025",
      gl_limit: 1_000_000,
      umbrella_limit: 5_000_000,
      effective: "2026-01-15",
      expiry: "2027-01-15",
    },
    confidence_avg: 0.96,
  },
  redact: {
    redacted_pages: 4,
    pii_types: ["SSN", "DOB", "ADDRESS", "EMAIL"],
    occurrences: 19,
    redaction_style: "blackout",
    audit_id: "rdct_01HVQ7K3ZA9YJ8C",
  },
  classify: {
    schema: "invoice.v3",
    confidence: 0.94,
    alternatives: [
      { schema: "credit_memo.v1", confidence: 0.04 },
      { schema: "purchase_order.v2", confidence: 0.02 },
    ],
    processing_ms: 287,
  },
  ocr: {
    pages: 12,
    characters_recognized: 28471,
    confidence_avg: 0.987,
    languages_detected: ["en"],
    processing_ms: 1840,
  },
  validate: {
    schema: "coi.v2",
    passed: true,
    checks_run: 14,
    warnings: [
      { field: "additional_insured", message: "Optional field empty" },
    ],
  },
  "sign-output": {
    algorithm: "Ed25519",
    key_id: "kx-prod-2026",
    manifest_hash:
      "0xb3f0c1a9d54fa1c0b8fd4eebd7fa11b1b16c9a3e2d2cc6f1f5a2f0a87e1b7a04",
  },
  authenticity: {
    verified: true,
    issuer: "State of California DMV",
    signed_at: "2025-11-04T17:22:00Z",
    watermark_match: true,
  },
  "tamper-check": {
    tampered: false,
    hash_match: true,
    modifications_detected: 0,
    last_known_good: "2026-04-22T09:14:00Z",
  },
  "encrypt-rest": {
    algorithm: "AES-256-GCM",
    key_mode: "BYOK",
    key_id: "arn:aws:kms:us-east-1:123:key/abc-…",
    object_id: "obj_01HVQ7M9B2",
  },
  "smart-redact": {
    schema: "coi.v2",
    redacted_fields: ["named_insured", "dob"],
    occurrences: 7,
    confidence_gate: 0.85,
    gated_by_confidence: 1,
  },
};
