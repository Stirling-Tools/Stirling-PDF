import { apiClient } from "@portal/api/http";
import type { StatusTone, ChipAccent } from "@app/ui";
import type { Tier } from "@portal/contexts/TierContext";

export type DocumentStatus = "processed" | "flagged" | "in-review" | "error";

/** Which Stirling product ran the operation. "Automation" = a policy/pipeline run's tool step. */
export type ProductType = "API" | "Editor" | "Automation";

/** A single field pulled out of the document by extraction. */
export interface Extraction {
  field: string;
  value: string;
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
  time: string;
  actor: string;
  detail: string;
}

export interface ReviewDocument {
  id: string;
  name: string;
  /** File-type label, e.g. "PDF". */
  type: string;
  /** Auto-classification label (e.g. "Contract"), or null when not classified. */
  classification: string | null;
  /** True when the classification was assigned automatically. */
  auto: boolean;
  /** Short descriptive sub-line (editor action or flag reason), or null. */
  note: string | null;
  /** Where it was processed. */
  product: ProductType;
  /** Pipeline/action, e.g. "contract". Null (or Editor product) renders "Editor". */
  action: string | null;
  /** The user who ran it. */
  user: string;
  status: DocumentStatus;
  /** Reviewer name for in-review docs, e.g. "Sarah K.". */
  reviewer: string | null;
  /** Originating source name. */
  source: string;
  /** Overall confidence 0..1, or null (unsupported - never shown in the table). */
  confidence: number | null;
  fieldsExtracted: number;
  /** Relative-time string, e.g. "2 min ago". */
  time: string;
  sensitive: boolean;
  extractions: Extraction[];
  audit: DocAuditEvent[];
}

export interface DocumentsSummary {
  totalInQueue: number;
  processed: number;
  errors: number;
  processedToday: number;
}

export interface DocumentsResponse {
  summary: DocumentsSummary;
  documents: ReviewDocument[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Presentation metadata (label + chip tone)                                */
/* ──────────────────────────────────────────────────────────────────────── */

/** Values are i18n keys — render with t(). */
export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  processed: "portal.documents.status.processed",
  flagged: "portal.documents.status.flagged",
  "in-review": "portal.documents.status.inReview",
  error: "portal.documents.status.error",
};

export const DOCUMENT_STATUS_TONE: Record<DocumentStatus, StatusTone> = {
  processed: "success",
  flagged: "warning",
  "in-review": "purple",
  error: "danger",
};

export const PRODUCT_CHIP_TONE: Record<ProductType, ChipAccent> = {
  API: "brand",
  Editor: "success",
  Automation: "warning",
};

/** Classification chip accent: danger when unclassified, warning when it needs a look. */
export function classificationTone(doc: ReviewDocument): ChipAccent {
  if (doc.classification === "Unclassified") return "danger";
  if (doc.status === "processed") return "success";
  return "warning";
}

/** Values are i18n keys — render with t(). */
export const DOC_AUDIT_LABEL: Record<DocAuditKind, string> = {
  ingested: "portal.documents.audit.ingested",
  extracted: "portal.documents.audit.extracted",
  flagged: "portal.documents.audit.flagged",
  reviewed: "portal.documents.audit.reviewed",
  approved: "portal.documents.audit.approved",
  archived: "portal.documents.audit.archived",
  elevation: "portal.documents.audit.elevation",
};

export const DOC_AUDIT_TONE: Record<DocAuditKind, StatusTone> = {
  ingested: "info",
  extracted: "success",
  flagged: "warning",
  reviewed: "purple",
  approved: "success",
  archived: "neutral",
  elevation: "purple",
};

/** GET the audit-derived Documents feed; SaaS or local, scoped server-side. `tier` ignored. */
export async function fetchDocuments(tier: Tier): Promise<DocumentsResponse> {
  const path = `/api/v1/proprietary/ui-data/documents?tier=${encodeURIComponent(tier)}`;
  return apiClient.saas.isConfigured()
    ? apiClient.saas.json<DocumentsResponse>(path)
    : apiClient.local.json<DocumentsResponse>(path);
}
