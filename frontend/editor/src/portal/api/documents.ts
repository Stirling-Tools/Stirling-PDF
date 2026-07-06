import { apiClient } from "@portal/api/http";
import type { DocumentsResponse } from "@portal/mocks/documents";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  DocAuditEvent,
  DocAuditKind,
  DocumentStatus,
  DocumentsResponse,
  DocumentsSummary,
  Extraction,
  ReviewDocument,
} from "@portal/mocks/documents";
export {
  DOC_AUDIT_LABEL,
  DOC_AUDIT_TONE,
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUS_TONE,
} from "@portal/mocks/documents";

/** GET /v1/documents?tier=… — summary strip + the review queue for the tier. */
export async function fetchDocuments(tier: Tier): Promise<DocumentsResponse> {
  return apiClient.local.json<DocumentsResponse>(
    `/v1/documents?tier=${encodeURIComponent(tier)}`,
  );
}
