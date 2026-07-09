import { apiClient } from "@portal/api/http";
import type { StatusTone } from "@app/ui";
import type { Tier } from "@portal/contexts/TierContext";

/*
 * A "document" here is a single item flowing through the org's pipelines and
 * waiting on a review/approval decision. Each carries its extracted fields, an
 * audit timeline, and a `sensitive` flag that gates whether its content is
 * shown directly or behind a zero-standing-access elevation request.
 */

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
/*  Lives client-side — product copy, not data.                              */
/* ──────────────────────────────────────────────────────────────────────── */

/** Values are i18n keys — render with t(). */
export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  processed: "portal.documents.status.processed",
  flagged: "portal.documents.status.flagged",
  "needs-review": "portal.documents.status.needsReview",
  archived: "portal.documents.status.archived",
};

export const DOCUMENT_STATUS_TONE: Record<DocumentStatus, StatusTone> = {
  processed: "success",
  flagged: "danger",
  "needs-review": "warning",
  archived: "neutral",
};

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
  extracted: "info",
  flagged: "danger",
  reviewed: "warning",
  approved: "success",
  archived: "neutral",
  elevation: "purple",
};

/* ──────────────────────────────────────────────────────────────────────── */
/*  Endpoints                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

/** GET /v1/documents?tier=… — summary strip + the review queue for the tier. */
export async function fetchDocuments(tier: Tier): Promise<DocumentsResponse> {
  return apiClient.local.json<DocumentsResponse>(
    `/v1/documents?tier=${encodeURIComponent(tier)}`,
  );
}
