/**
 * Documents fixtures and the types api/documents.ts shares with them.
 *
 * A "document" is a file your org has processed, shown with its processing
 * record: which product ran it (API vs Editor), the pipeline/action, the user,
 * a classification chip (when auto-classified), the outcome, and when. Content
 * access is request-gated (the `sensitive` flag drives the drawer's elevation).
 * The real backend fills what it can from audit_events; the MSW handlers serve
 * these fixtures for the demo. Confidence scores aren't supported yet, so they
 * stay null and never surface in the table.
 */

import type { Tier } from "@portal/contexts/TierContext";
import type {
  DocAuditEvent,
  DocAuditKind,
  DocumentStatus,
  DocumentsResponse,
  DocumentsSummary,
  ProductType,
  ReviewDocument,
} from "@portal/api/documents";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Domain types                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────────── */
/*  Fixture builder                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

type DocSeed = {
  id: string;
  name: string;
  product: ProductType;
  user: string;
  status: DocumentStatus;
  time: string;
  classification?: string;
  auto?: boolean;
  note?: string;
  action?: string;
  reviewer?: string;
  sensitive?: boolean;
  type?: string;
};

function mk(s: DocSeed): ReviewDocument {
  const source = s.product === "API" ? "API integration" : "Web upload";
  const resultKind: DocAuditKind =
    s.status === "flagged"
      ? "flagged"
      : s.status === "in-review"
        ? "reviewed"
        : "extracted";
  const audit: DocAuditEvent[] = [
    {
      id: `${s.id}-a1`,
      kind: "ingested",
      time: s.time,
      actor: s.user || "system",
      detail: `Received via ${source}`,
    },
    {
      id: `${s.id}-a2`,
      kind: resultKind,
      time: s.time,
      actor: s.user || "system",
      detail: s.note ?? (s.action ? `Ran ${s.action}` : "Processed"),
    },
  ];
  return {
    id: s.id,
    name: s.name,
    type: s.type ?? "PDF",
    classification: s.classification ?? null,
    auto: s.auto ?? false,
    note: s.note ?? null,
    product: s.product,
    action: s.action ?? null,
    user: s.user,
    status: s.status,
    reviewer: s.reviewer ?? null,
    source,
    confidence: null,
    fieldsExtracted: 0,
    time: s.time,
    sensitive: s.sensitive ?? false,
    extractions: [],
    audit,
  };
}

// Ordered newest-first; 15 processed, 4 needs-review, 1 in-review → "All 20".
const DOCS: ReviewDocument[] = [
  mk({
    id: "d1",
    name: "acme_services_agreement.pdf",
    classification: "Contract",
    auto: true,
    product: "API",
    action: "contract",
    user: "matt",
    status: "processed",
    time: "2 min ago",
  }),
  mk({
    id: "d2",
    name: "quarterly_report_draft.pdf",
    note: "Merge + watermark removal",
    product: "Editor",
    user: "sarah.k",
    status: "processed",
    time: "3 min ago",
  }),
  mk({
    id: "d3",
    name: "flagged_contract.pdf",
    classification: "Contract",
    note: "Low confidence PII detection",
    product: "API",
    action: "contract",
    user: "matt",
    status: "flagged",
    time: "4 min ago",
  }),
  mk({
    id: "d4",
    name: "loan_disclosure_preview.pdf",
    classification: "Closing Disclosure",
    auto: true,
    product: "API",
    action: "closing disclosure",
    user: "",
    status: "processed",
    time: "5 min ago",
  }),
  mk({
    id: "d5",
    name: "patient_intake_form.pdf",
    classification: "Patient Intake",
    auto: true,
    product: "API",
    action: "patient intake",
    user: "matt",
    status: "processed",
    time: "6 min ago",
  }),
  mk({
    id: "d6",
    name: "invoice_batch_march.pdf",
    note: "Split into 12 pages + OCR",
    product: "Editor",
    user: "mike.r",
    status: "processed",
    time: "8 min ago",
  }),
  mk({
    id: "d7",
    name: "unknown_format.pdf",
    classification: "Unclassified",
    note: "Unrecognized format, needs manual classification",
    product: "API",
    action: "documents",
    user: "matt",
    status: "flagged",
    time: "9 min ago",
  }),
  mk({
    id: "d8",
    name: "employee_w2_martinez.pdf",
    classification: "Tax Document",
    auto: true,
    product: "API",
    action: "tax document",
    user: "matt",
    status: "processed",
    time: "11 min ago",
  }),
  mk({
    id: "d9",
    name: "nda_countersigned.pdf",
    classification: "Contract",
    auto: true,
    product: "API",
    action: "contract",
    user: "",
    status: "processed",
    time: "13 min ago",
  }),
  mk({
    id: "d10",
    name: "ambiguous_signature.pdf",
    classification: "Contract",
    note: "Signature verification failed",
    product: "API",
    action: "contract",
    user: "matt",
    status: "in-review",
    reviewer: "Sarah K.",
    time: "15 min ago",
  }),
  mk({
    id: "d11",
    name: "vendor_invoice_globex.pdf",
    classification: "Invoice",
    auto: true,
    product: "API",
    action: "invoice",
    user: "matt",
    status: "processed",
    time: "18 min ago",
  }),
  mk({
    id: "d12",
    name: "merged_appendix.pdf",
    note: "Merge + compress",
    product: "Editor",
    user: "sarah.k",
    status: "processed",
    time: "22 min ago",
  }),
  mk({
    id: "d13",
    name: "medical_record_scan.pdf",
    classification: "Patient Intake",
    auto: true,
    product: "API",
    action: "patient intake",
    user: "lisa.m",
    status: "processed",
    time: "25 min ago",
    sensitive: true,
  }),
  mk({
    id: "d14",
    name: "redacted_statement.pdf",
    note: "Redact PII + flatten",
    product: "Editor",
    user: "mike.r",
    status: "processed",
    time: "30 min ago",
    sensitive: true,
  }),
  mk({
    id: "d15",
    name: "w4_form_chen.pdf",
    classification: "Tax Document",
    auto: true,
    product: "API",
    action: "tax document",
    user: "matt",
    status: "processed",
    time: "35 min ago",
  }),
  mk({
    id: "d16",
    name: "offer_letter_draft.pdf",
    classification: "Contract",
    note: "Missing signature block",
    product: "API",
    action: "contract",
    user: "john.d",
    status: "flagged",
    time: "40 min ago",
  }),
  mk({
    id: "d17",
    name: "compressed_brochure.pdf",
    note: "Compress + convert to PDF",
    product: "Editor",
    user: "sarah.k",
    status: "processed",
    time: "48 min ago",
  }),
  mk({
    id: "d18",
    name: "blurry_receipt.pdf",
    classification: "Unclassified",
    note: "Image too low-res to classify",
    product: "API",
    action: "documents",
    user: "matt",
    status: "flagged",
    time: "52 min ago",
  }),
  mk({
    id: "d19",
    name: "signed_nda_partner.pdf",
    classification: "Contract",
    auto: true,
    product: "API",
    action: "contract",
    user: "",
    status: "processed",
    time: "1 h ago",
  }),
  mk({
    id: "d20",
    name: "bank_statement_june.pdf",
    classification: "Closing Disclosure",
    auto: true,
    product: "API",
    action: "closing disclosure",
    user: "lisa.m",
    status: "processed",
    time: "1 h ago",
    sensitive: true,
  }),
];

/** Documents for a given tier. Free is a slim queue; pro/enterprise get all. */
export function documentsFor(tier: Tier): ReviewDocument[] {
  if (tier === "free") return DOCS.filter((d) => !d.sensitive).slice(0, 6);
  return DOCS;
}

export function summaryFor(tier: Tier): DocumentsSummary {
  const docs = documentsFor(tier);
  const processed = docs.filter((d) => d.status === "processed").length;
  return {
    totalInQueue: docs.length,
    processed,
    errors: docs.filter((d) => d.status === "error").length,
    processedToday: processed,
  };
}

export function buildDocumentsResponse(tier: Tier): DocumentsResponse {
  return { summary: summaryFor(tier), documents: documentsFor(tier) };
}
