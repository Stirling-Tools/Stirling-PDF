import { apiClient } from "@portal/api/http";

/**
 * Stored supporting files for pipeline steps (backend PolicyAssetController).
 *
 * A pipeline step that needs more than the document stream - a signing
 * certificate, a watermark/stamp image, overlay PDFs, attachments - references
 * its file by id from the step's `fileParameters` as `asset:<id>`. The bytes are
 * uploaded here first (the save-time validator rejects a policy that binds an
 * asset id that doesn't yet exist), then a triggered or scheduled run loads the
 * file server-side without anyone re-supplying it. Assets are team-scoped exactly
 * like the policies that reference them, and unreferenced uploads are cleaned up
 * server-side, so the builder never has to delete what a cancelled edit left.
 */

/** Metadata for one stored supporting file. Mirrors the Java `PolicyAsset` record. */
export interface PolicyAsset {
  id: string;
  fileName: string;
  contentType: string | null;
  size: number;
  createdAt: number;
}

/** POST /api/v1/policies/assets: store a supporting file, returning its metadata (with the id). */
export async function uploadPipelineAsset(file: File): Promise<PolicyAsset> {
  const form = new FormData();
  form.append("file", file);
  return apiClient.local.multipart<PolicyAsset>(
    "/api/v1/policies/assets",
    form,
  );
}

/** GET /api/v1/policies/assets: the team's stored supporting files (metadata only). */
export async function listPipelineAssets(): Promise<PolicyAsset[]> {
  return apiClient.local.json<PolicyAsset[]>("/api/v1/policies/assets");
}

/** GET /api/v1/policies/assets/{id}/content: an asset's bytes, for re-sending on an ad-hoc test run. */
export async function fetchPipelineAssetContent(
  assetId: string,
): Promise<Blob> {
  return apiClient.local.blob(
    `/api/v1/policies/assets/${encodeURIComponent(assetId)}/content`,
  );
}
