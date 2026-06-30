/**
 * Document review-queue fixtures and the types api/documents.ts shares with them.
 *
 * A "document" here is a single item flowing through the org's pipelines and
 * waiting on a review/approval decision. Each carries its extracted fields, an
 * audit timeline, and a `sensitive` flag that gates whether its content is
 * shown directly or behind a zero-standing-access elevation request.
 *
 * api/documents.ts imports the types; the MSW handlers serve the fixture data
 * over the intercepted apiClient.local.json() calls. Components never reach into this
 * module directly. Once a real backend exists the handlers stop being
 * registered and these fixtures can be deleted (or kept as test seeds).
 */

import type { Tier } from "@portal/contexts/TierContext";
import type { StatusTone } from "@shared/components";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Domain types                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

export type DocumentStatus =
  | "processed"
  | "flagged"
  | "needs-review"
  | "archived";

/** A single field pulled out of the document by extraction. */
export interface Extraction {
  field: string;
  value: string;
  /** Per-field confidence 0..1. */
  confidence: number;
}

export type DocAuditKind =
  | "ingested"
  | "extracted"
  | "flagged"
  | "reviewed"
  | "approved"
  | "archived"
  | "elevation";

/** One event in a document's lifecycle, newest last. */
export interface DocAuditEvent {
  id: string;
  kind: DocAuditKind;
  /** Relative-time string, e.g. "2m ago". */
  time: string;
  actor: string;
  detail: string;
}

export interface ReviewDocument {
  id: string;
  name: string;
  /** Document type label, e.g. "Invoice", "Contract". */
  type: string;
  status: DocumentStatus;
  /** Originating source name. */
  source: string;
  /** Overall extraction confidence 0..1. */
  confidence: number;
  /** Count of extracted fields (matches extractions.length). */
  fieldsExtracted: number;
  /** Relative-time string, e.g. "4m ago". */
  time: string;
  /**
   * When true, content sits behind a zero-standing-access wall. The viewer
   * sees a "Request access" affordance instead of the extractions until a
   * timed elevation is granted.
   */
  sensitive: boolean;
  extractions: Extraction[];
  audit: DocAuditEvent[];
}

export interface DocumentsSummary {
  /** Total documents currently in the queue. */
  totalInQueue: number;
  needsReview: number;
  /** Mean extraction confidence across the queue, 0..1. */
  avgConfidence: number;
  processedToday: number;
}

export interface DocumentsResponse {
  summary: DocumentsSummary;
  documents: ReviewDocument[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Presentation metadata (label + chip tone)                                */
/*  Lives client-side — product copy, not data. Re-exported via api/.        */
/* ──────────────────────────────────────────────────────────────────────── */

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  processed: "Processed",
  flagged: "Flagged",
  "needs-review": "Needs review",
  archived: "Archived",
};

export const DOCUMENT_STATUS_TONE: Record<DocumentStatus, StatusTone> = {
  processed: "success",
  flagged: "danger",
  "needs-review": "warning",
  archived: "neutral",
};

export const DOC_AUDIT_LABEL: Record<DocAuditKind, string> = {
  ingested: "Ingested",
  extracted: "Extracted",
  flagged: "Flagged",
  reviewed: "Reviewed",
  approved: "Approved",
  archived: "Archived",
  elevation: "Elevation",
};

export const DOC_AUDIT_TONE: Record<DocAuditKind, StatusTone> = {
  ingested: "info",
  extracted: "info",
  flagged: "danger",
  reviewed: "warning",
  approved: "success",
  archived: "neutral",
  elevation: "purple",
};

/* ──────────────────────────────────────────────────────────────────────── */
/*  Fixture builders                                                         */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Pro-tier queue. A spread of statuses, types, sources, and confidences plus
 * deliberate edge cases: a 100%-confidence clean processed doc, a flagged
 * low-confidence outlier, and a doc with zero extracted fields.
 */
const PRO_DOCS: ReviewDocument[] = [
  {
    id: "doc-inv-8841",
    name: "ACME-INV-8841.pdf",
    type: "Invoice",
    status: "needs-review",
    source: "invoices@acme.com",
    confidence: 0.82,
    fieldsExtracted: 6,
    time: "3m ago",
    sensitive: false,
    extractions: [
      { field: "Vendor", value: "Globex Supplies Ltd", confidence: 0.98 },
      { field: "Invoice no.", value: "INV-8841", confidence: 0.99 },
      { field: "Invoice date", value: "2026-06-12", confidence: 0.94 },
      { field: "Due date", value: "2026-07-12", confidence: 0.88 },
      { field: "Total", value: "$12,480.00", confidence: 0.71 },
      { field: "PO number", value: "PO-2231 (unverified)", confidence: 0.42 },
    ],
    audit: [
      {
        id: "a1",
        kind: "ingested",
        time: "4m ago",
        actor: "invoices@acme.com",
        detail: "Received via email inbox",
      },
      {
        id: "a2",
        kind: "extracted",
        time: "4m ago",
        actor: "Invoice Extractor",
        detail: "6 fields extracted · 82% mean confidence",
      },
      {
        id: "a3",
        kind: "flagged",
        time: "3m ago",
        actor: "Invoice Extractor",
        detail: "PO number below 50% confidence — routed to review",
      },
    ],
  },
  {
    id: "doc-receipt-3320",
    name: "expense-receipt-3320.jpg",
    type: "Receipt",
    status: "processed",
    source: "Stirling Desktop — Reviewer pool",
    confidence: 1.0,
    fieldsExtracted: 4,
    time: "11m ago",
    sensitive: false,
    extractions: [
      { field: "Merchant", value: "Blue Bottle Coffee", confidence: 1.0 },
      { field: "Date", value: "2026-06-15", confidence: 1.0 },
      { field: "Amount", value: "$8.50", confidence: 1.0 },
      { field: "Category", value: "Meals", confidence: 1.0 },
    ],
    audit: [
      {
        id: "a1",
        kind: "ingested",
        time: "12m ago",
        actor: "review-team@acme.com",
        detail: "Uploaded from desktop app",
      },
      {
        id: "a2",
        kind: "extracted",
        time: "12m ago",
        actor: "Invoice Extractor",
        detail: "4 fields extracted · 100% mean confidence",
      },
      {
        id: "a3",
        kind: "approved",
        time: "11m ago",
        actor: "Invoice Extractor",
        detail: "Auto-approved — all fields above threshold",
      },
    ],
  },
  {
    id: "doc-contract-7712",
    name: "MSA-Globex-2026.pdf",
    type: "Contract",
    status: "needs-review",
    source: "SharePoint — Legal",
    confidence: 0.76,
    fieldsExtracted: 5,
    // Sensitive: legal contract behind zero-standing-access. Content is hidden
    // until a timed elevation is granted.
    sensitive: true,
    time: "27m ago",
    extractions: [
      { field: "Counterparty", value: "Globex Corporation", confidence: 0.95 },
      { field: "Effective date", value: "2026-07-01", confidence: 0.9 },
      { field: "Term", value: "36 months", confidence: 0.84 },
      { field: "Auto-renewal", value: "Yes — 12 months", confidence: 0.61 },
      { field: "Governing law", value: "Delaware", confidence: 0.49 },
    ],
    audit: [
      {
        id: "a1",
        kind: "ingested",
        time: "31m ago",
        actor: "SharePoint — Legal",
        detail: "Synced from Contracts / Inbound",
      },
      {
        id: "a2",
        kind: "extracted",
        time: "30m ago",
        actor: "Contract Router",
        detail: "5 fields extracted · 76% mean confidence",
      },
      {
        id: "a3",
        kind: "flagged",
        time: "27m ago",
        actor: "Contract Router",
        detail: "Governing-law clause ambiguous — routed to legal review",
      },
    ],
  },
  {
    id: "doc-claim-1190",
    name: "claim-1190-intake.pdf",
    type: "Claim",
    status: "flagged",
    source: "S3 — claims-intake",
    confidence: 0.38,
    fieldsExtracted: 3,
    // Edge case: low-confidence outlier that failed to parse a scanned form.
    sensitive: false,
    time: "44m ago",
    extractions: [
      { field: "Claimant", value: "(illegible)", confidence: 0.21 },
      { field: "Policy no.", value: "POL-44120", confidence: 0.66 },
      { field: "Claim amount", value: "(not found)", confidence: 0.0 },
    ],
    audit: [
      {
        id: "a1",
        kind: "ingested",
        time: "46m ago",
        actor: "S3 — claims-intake",
        detail: "Picked up from intake bucket",
      },
      {
        id: "a2",
        kind: "extracted",
        time: "45m ago",
        actor: "KYC Processor",
        detail: "3 fields extracted · 38% mean confidence",
      },
      {
        id: "a3",
        kind: "flagged",
        time: "44m ago",
        actor: "KYC Processor",
        detail: "Scan quality too low — manual re-key required",
      },
    ],
  },
  {
    id: "doc-w9-0042",
    name: "vendor-W9-globex.pdf",
    type: "Tax form",
    status: "processed",
    source: "Acme Production",
    confidence: 0.93,
    fieldsExtracted: 5,
    sensitive: true,
    time: "1h ago",
    extractions: [
      { field: "Legal name", value: "Globex Supplies Ltd", confidence: 0.97 },
      { field: "TIN", value: "••-•••4821", confidence: 0.91 },
      { field: "Entity type", value: "LLC", confidence: 0.95 },
      {
        field: "Address",
        value: "44 Industrial Way, Springfield",
        confidence: 0.9,
      },
      { field: "Signature", value: "Present", confidence: 0.92 },
    ],
    audit: [
      {
        id: "a1",
        kind: "ingested",
        time: "1h ago",
        actor: "Acme Production",
        detail: "Uploaded via POST /v1/extract",
      },
      {
        id: "a2",
        kind: "extracted",
        time: "1h ago",
        actor: "KYC Processor",
        detail: "5 fields extracted · 93% mean confidence",
      },
      {
        id: "a3",
        kind: "approved",
        time: "58m ago",
        actor: "you@acme.com",
        detail: "Reviewed and approved",
      },
    ],
  },
  {
    id: "doc-po-6610",
    name: "purchase-order-6610.pdf",
    type: "Purchase order",
    status: "archived",
    source: "Nightly archive reprocess",
    confidence: 0.88,
    fieldsExtracted: 4,
    sensitive: false,
    time: "8h ago",
    extractions: [
      { field: "Supplier", value: "Initech", confidence: 0.92 },
      { field: "PO number", value: "PO-6610", confidence: 0.99 },
      { field: "Line items", value: "7", confidence: 0.85 },
      { field: "Total", value: "$3,210.00", confidence: 0.78 },
    ],
    audit: [
      {
        id: "a1",
        kind: "ingested",
        time: "8h ago",
        actor: "Nightly archive reprocess",
        detail: "Reprocessed from archive bucket",
      },
      {
        id: "a2",
        kind: "extracted",
        time: "8h ago",
        actor: "Invoice Extractor",
        detail: "4 fields extracted · 88% mean confidence",
      },
      {
        id: "a3",
        kind: "archived",
        time: "8h ago",
        actor: "system",
        detail: "Retention policy — archived after approval",
      },
    ],
  },
];

/**
 * Enterprise-only additions — deeper queue with more sensitive items so the
 * zero-standing-access elevation flow has something to gate, plus richer
 * audit trails.
 */
const ENTERPRISE_EXTRA: ReviewDocument[] = [
  {
    id: "doc-kyc-5523",
    name: "onboarding-passport-5523.pdf",
    type: "KYC document",
    status: "needs-review",
    source: "S3 — claims-intake",
    confidence: 0.79,
    fieldsExtracted: 6,
    sensitive: true,
    time: "9m ago",
    extractions: [
      { field: "Full name", value: "Maria L. Vance", confidence: 0.96 },
      { field: "Document type", value: "Passport", confidence: 0.99 },
      { field: "Document no.", value: "••••••742", confidence: 0.83 },
      { field: "Date of birth", value: "1989-03-14", confidence: 0.88 },
      { field: "Nationality", value: "United Kingdom", confidence: 0.94 },
      { field: "Expiry", value: "2029-11-02", confidence: 0.55 },
    ],
    audit: [
      {
        id: "a1",
        kind: "ingested",
        time: "10m ago",
        actor: "S3 — claims-intake",
        detail: "Picked up from intake bucket",
      },
      {
        id: "a2",
        kind: "extracted",
        time: "10m ago",
        actor: "KYC Processor",
        detail: "6 fields extracted · 79% mean confidence",
      },
      {
        id: "a3",
        kind: "flagged",
        time: "9m ago",
        actor: "Compliance Sweep",
        detail: "PII present — four-eyes review required before release",
      },
    ],
  },
  {
    id: "doc-dpa-2207",
    name: "DPA-globex-amendment.pdf",
    type: "Contract",
    status: "flagged",
    source: "SharePoint — Legal",
    confidence: 0.84,
    fieldsExtracted: 5,
    sensitive: true,
    time: "1h ago",
    extractions: [
      { field: "Counterparty", value: "Globex Corporation", confidence: 0.95 },
      { field: "Data categories", value: "PII, financial", confidence: 0.81 },
      { field: "Sub-processors", value: "3 listed", confidence: 0.77 },
      { field: "SCC version", value: "2021/914", confidence: 0.9 },
      { field: "Breach window", value: "72 hours", confidence: 0.76 },
    ],
    audit: [
      {
        id: "a1",
        kind: "ingested",
        time: "1h ago",
        actor: "SharePoint — Legal",
        detail: "Synced from Contracts / Inbound",
      },
      {
        id: "a2",
        kind: "extracted",
        time: "1h ago",
        actor: "Contract Router",
        detail: "5 fields extracted · 84% mean confidence",
      },
      {
        id: "a3",
        kind: "flagged",
        time: "1h ago",
        actor: "Compliance Sweep",
        detail: "Sub-processor list changed — escalated to DPO",
      },
    ],
  },
  {
    id: "doc-coi-9001",
    name: "certificate-of-insurance-9001.pdf",
    type: "Compliance",
    status: "processed",
    source: "Compliance Sweep",
    confidence: 0.96,
    fieldsExtracted: 5,
    sensitive: false,
    time: "2h ago",
    extractions: [
      { field: "Insured", value: "Acme Corp", confidence: 0.98 },
      { field: "Carrier", value: "Liberty Mutual", confidence: 0.97 },
      { field: "Policy no.", value: "CGL-77120", confidence: 0.95 },
      { field: "Coverage", value: "$2,000,000", confidence: 0.96 },
      { field: "Expiry", value: "2027-01-31", confidence: 0.94 },
    ],
    audit: [
      {
        id: "a1",
        kind: "ingested",
        time: "2h ago",
        actor: "Compliance Sweep",
        detail: "Pulled for COI compliance check",
      },
      {
        id: "a2",
        kind: "extracted",
        time: "2h ago",
        actor: "Compliance Sweep",
        detail: "5 fields extracted · 96% mean confidence",
      },
      {
        id: "a3",
        kind: "approved",
        time: "2h ago",
        actor: "compliance@acme.com",
        detail: "Coverage verified — approved",
      },
    ],
  },
];

/** Documents for a given tier. Free is a slim queue; enterprise is the deepest. */
export function documentsFor(tier: Tier): ReviewDocument[] {
  if (tier === "free") {
    // Free keeps a simple, non-sensitive queue — no elevation flow to exercise.
    return PRO_DOCS.filter((d) => !d.sensitive).slice(0, 3);
  }
  if (tier === "enterprise") return [...ENTERPRISE_EXTRA, ...PRO_DOCS];
  return PRO_DOCS;
}

/** Summary strip derived from the tier's queue so the KPIs always reconcile. */
export function summaryFor(tier: Tier): DocumentsSummary {
  const docs = documentsFor(tier);
  const needsReview = docs.filter((d) => d.status === "needs-review").length;
  const avgConfidence =
    docs.length === 0
      ? 0
      : docs.reduce((sum, d) => sum + d.confidence, 0) / docs.length;
  // "Processed today" approximates same-day throughput from the visible queue;
  // a real backend would count against an actual calendar boundary.
  const processedToday = docs.filter(
    (d) => d.status === "processed" || d.status === "archived",
  ).length;
  return {
    totalInQueue: docs.length,
    needsReview,
    avgConfidence,
    processedToday,
  };
}

export function buildDocumentsResponse(tier: Tier): DocumentsResponse {
  return { summary: summaryFor(tier), documents: documentsFor(tier) };
}
