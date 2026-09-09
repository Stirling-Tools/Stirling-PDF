import { apiClient } from "@portal/api/http";
import type { Policy } from "@portal/api/pipelines";

/**
 * Pipeline store contract. The store is hosted by the SaaS backend, so every
 * `/api/v1/store` call goes over `apiClient.saas` (self-hosted reaches it through
 * the account link; on the SaaS build it is the same backend). Installing is the
 * one exception: the copy is created on THIS instance, so the import goes over
 * `apiClient.local`.
 *
 * Public data never carries an author. `viewer.author` is only present when the
 * viewer is a teammate of the publisher.
 */

export type StoreSort = "stars" | "newest" | "installs";

export const STORE_CATEGORIES = [
  "ingestion",
  "security",
  "classification",
  "compliance",
  "routing",
  "retention",
] as const;

export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export function isStoreCategory(value: unknown): value is StoreCategory {
  return (
    typeof value === "string" &&
    (STORE_CATEGORIES as readonly string[]).includes(value)
  );
}

export interface StoreListingSummary {
  storeId: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  /** Operation endpoint paths, e.g. "/api/v1/misc/compress-pdf". */
  tools: string[];
  starCount: number;
  installCount: number;
  /** ISO timestamp. */
  updatedAt: string;
  curated: boolean;
  needsConnections: boolean;
  /** Null when the viewer is anonymous. */
  starred: boolean | null;
}

export interface StoreRequiredOnInstall {
  kind: "source" | "destination" | "parameter";
  stepIndex?: number;
  field?: string;
  reason?: string;
}

export interface StoreManifestStep {
  operation: string;
  parameters: Record<string, unknown>;
}

export interface StoreManifest {
  manifestSchemaVersion: number;
  name: string;
  description: string;
  category: string;
  icon: string;
  steps: StoreManifestStep[];
  requiredOnInstall: StoreRequiredOnInstall[];
  suggestedTrigger?: string | null;
  minimumStirlingVersion?: string | null;
}

export interface StoreViewer {
  starred: boolean;
  isTeammate: boolean;
  author?: { displayName: string };
}

export interface StoreListingDetail extends StoreListingSummary {
  firstPublishedAt: string;
  latestChange: string | null;
  steps: StoreManifestStep[];
  requiredOnInstall: StoreRequiredOnInstall[];
  minimumStirlingVersion: string | null;
  viewer: StoreViewer | null;
}

export type StoreFindingSeverity = "block" | "warn" | "info";

export interface StoreFindingWhere {
  kind: "step" | "details" | "input" | "output";
  stepIndex?: number;
  operation?: string;
}

export interface StoreFinding {
  severity: StoreFindingSeverity;
  code: string;
  title: string;
  detail: string;
  where: StoreFindingWhere;
}

export interface StorePreflightReport {
  findings: StoreFinding[];
  canPublish: boolean;
  /** Set when this pipeline already has a listing owned by your team: the flow is a republish. */
  existingStoreId: string | null;
  manifest: StoreManifest | null;
}

export interface StorePublishRequest {
  policyId: string;
  name: string;
  description: string;
  category: string;
  whatChanged?: string;
}

export type StoreTeamListingStatus = "LISTED" | "REMOVED";

export interface StoreTeamListing {
  storeId: string;
  name: string;
  starCount: number;
  installCount: number;
  status: StoreTeamListingStatus;
  removedBy: "TEAM" | "STAFF" | null;
  updatedAt: string;
  publishedBy: string | null;
}

export interface StoreListPage {
  items: StoreListingSummary[];
  nextCursor: string | null;
  total: number;
}

export interface StoreListParams {
  q?: string;
  sort?: StoreSort;
  /** Operation endpoint paths. */
  tools?: string[];
  category?: string;
  limit?: number;
}

export interface StoreStarResponse {
  starCount: number;
  starred: boolean;
}

export type StoreInstallTarget = "team" | "server";

const BASE = "/api/v1/store";
const PUBLIC = `${BASE}/public/pipelines`;
const PAGE_SIZE = 24;

function listingPath(storeId: string): string {
  return `${BASE}/pipelines/${encodeURIComponent(storeId)}`;
}

/** GET /api/v1/store/public/pipelines: one page of listings. */
export async function fetchStoreListings(
  params: StoreListParams,
  cursor?: string | null,
): Promise<StoreListPage> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.sort) search.set("sort", params.sort);
  if (params.tools?.length) search.set("tools", params.tools.join(","));
  if (params.category) search.set("category", params.category);
  if (cursor) search.set("cursor", cursor);
  search.set("limit", String(params.limit ?? PAGE_SIZE));
  return apiClient.saas.json<StoreListPage>(`${PUBLIC}?${search.toString()}`);
}

/** GET /api/v1/store/public/pipelines/{storeId}: the read-only listing detail. */
export async function fetchStoreListing(
  storeId: string,
): Promise<StoreListingDetail> {
  return apiClient.saas.json<StoreListingDetail>(
    `${PUBLIC}/${encodeURIComponent(storeId)}`,
  );
}

/** GET /api/v1/store/public/pipelines/{storeId}/manifest: what an install copies. */
export async function fetchStoreManifest(
  storeId: string,
): Promise<StoreManifest> {
  return apiClient.saas.json<StoreManifest>(
    `${PUBLIC}/${encodeURIComponent(storeId)}/manifest`,
  );
}

/** POST /api/v1/store/publish/preflight: the server's report on what would be published. */
export async function preflightPublish(
  body: StorePublishRequest,
): Promise<StorePreflightReport> {
  return apiClient.saas.json<StorePreflightReport>(
    `${BASE}/publish/preflight`,
    { method: "POST", body },
  );
}

/** POST /api/v1/store/publish: create the listing (or republish when one exists for the team). */
export async function publishPipeline(
  body: StorePublishRequest,
): Promise<StoreListingDetail> {
  return apiClient.saas.json<StoreListingDetail>(`${BASE}/publish`, {
    method: "POST",
    body,
  });
}

/** POST /api/v1/store/pipelines/{storeId}/republish: replace the store copy under the same id. */
export async function republishPipeline(
  storeId: string,
  body: StorePublishRequest,
): Promise<StoreListingDetail> {
  return apiClient.saas.json<StoreListingDetail>(
    `${listingPath(storeId)}/republish`,
    { method: "POST", body },
  );
}

/** DELETE /api/v1/store/pipelines/{storeId}: soft-remove the listing from the store. */
export async function removeStoreListing(storeId: string): Promise<void> {
  await apiClient.saas.json<void>(listingPath(storeId), { method: "DELETE" });
}

/** PUT / DELETE /api/v1/store/pipelines/{storeId}/star. */
export async function setStoreStar(
  storeId: string,
  starred: boolean,
): Promise<StoreStarResponse> {
  return apiClient.saas.json<StoreStarResponse>(
    `${listingPath(storeId)}/star`,
    {
      method: starred ? "PUT" : "DELETE",
    },
  );
}

/** POST /api/v1/store/pipelines/{storeId}/install: count an install. Best-effort. */
export async function recordStoreInstall(
  storeId: string,
  target: StoreInstallTarget,
): Promise<{ installCount: number }> {
  return apiClient.saas.json<{ installCount: number }>(
    `${listingPath(storeId)}/install`,
    { method: "POST", body: { target } },
  );
}

/** GET /api/v1/store/team/pipelines: every listing your team has published, removed ones included. */
export async function fetchTeamStoreListings(): Promise<StoreTeamListing[]> {
  return apiClient.saas.json<StoreTeamListing[]>(`${BASE}/team/pipelines`);
}

/** GET /api/v1/store/starred: the viewer's starred listings. */
export async function fetchStarredListings(): Promise<StoreListingSummary[]> {
  return apiClient.saas.json<StoreListingSummary[]>(`${BASE}/starred`);
}

export interface StoreImportRequest {
  name: string;
  icon: string;
  storeId: string;
  steps: StoreManifestStep[];
}

/**
 * POST /api/v1/policies/import (LOCAL backend): create a paused copy of a manifest on this
 * instance. The backend resolves name collisions itself.
 */
export async function importStorePipeline(
  body: StoreImportRequest,
): Promise<Policy> {
  return apiClient.local.json<Policy>("/api/v1/policies/import", {
    method: "POST",
    body,
  });
}
