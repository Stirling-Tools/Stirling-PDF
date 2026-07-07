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
  ProductType,
  ReviewDocument,
} from "@portal/mocks/documents";
export {
  classificationTone,
  DOC_AUDIT_LABEL,
  DOC_AUDIT_TONE,
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_STATUS_TONE,
  PRODUCT_CHIP_TONE,
} from "@portal/mocks/documents";

/**
 * GET /api/v1/proprietary/ui-data/documents?tier=…
 *
 * Real backend (Enterprise): the processing record derived from audit_events,
 * cached and scoped to the caller (admin → whole server; SaaS team leader →
 * their team). Routes via apiClient.saas in SaaS (Supabase JWT), else local.
 * `tier` is ignored server-side.
 */
export async function fetchDocuments(tier: Tier): Promise<DocumentsResponse> {
  const path = `/api/v1/proprietary/ui-data/documents?tier=${encodeURIComponent(tier)}`;
  return apiClient.saas.isConfigured()
    ? apiClient.saas.json<DocumentsResponse>(path)
    : apiClient.local.json<DocumentsResponse>(path);
}
