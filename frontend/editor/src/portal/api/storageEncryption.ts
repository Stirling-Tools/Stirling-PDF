import { apiClient, HttpError } from "@portal/api/http";

/**
 * Admin API for storage encryption at rest. Mirrors the Spring surface added in
 * PR #7173 (`/api/v1/admin/storage-encryption`), which is admin-only and never
 * accepts or returns key material.
 */

const BASE = "/api/v1/admin/storage-encryption";

/**
 * Runbook sections the panel links to. These point at the devGuide until the
 * encryption-at-rest pages are published on docs.stirlingpdf.com.
 */
const RUNBOOK =
  "https://github.com/Stirling-Tools/Stirling-PDF/blob/main/devGuide/STORAGE_ENCRYPTION_AT_REST.md";
const section = (anchor: string) => `${RUNBOOK}#${anchor}`;
export const RUNBOOK_BACKUP = section("backing-up-the-master-key");
export const RUNBOOK_ROTATION = section("rotating-the-master-key");

export type EncryptionKeyStatus = "ACTIVE" | "RETIRED" | "DISABLED";

export type EncryptionScopeType = "GLOBAL" | "TEAM" | "SOURCE";

/** Where the master key came from. Absent on backends that predate the field. */
export type MasterKeySource = "config" | "environment" | "generated";

export interface EncryptionKeyInfo {
  keyId: string;
  scopeType: EncryptionScopeType;
  scopeId: number;
  keyVersion: number;
  masterKeyVersion: number;
  status: EncryptionKeyStatus;
  createdAt: string;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
}

export interface StorageEncryptionStatus {
  /** New uploads are encrypted. False with `active` true means decrypt-only. */
  writeEnabled: boolean;
  /** Key machinery is materialised, so encrypted content can be read. */
  active: boolean;
  /** SHA-256 prefix of the master key, for comparing against a backup. */
  masterKeyFingerprint: string | null;
  masterKeyVersion: number | null;
  /** Null until the key machinery has materialised on this node. */
  masterKeySource: MasterKeySource | null;
  /** Backend serving stored blobs: local, database or s3. */
  provider: string | null;
  encryptedFiles: number;
  plaintextFiles: number;
  /** Counted server-side, so it stays right when the key list is paged. */
  pendingRotationRows: number;
  keys: EncryptionKeyInfo[];
}

export type MigrationState = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";

export interface MigrationStatus {
  state: MigrationState;
  total: number | null;
  processed: number | null;
  skipped: number | null;
  failed: number | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RotationResult {
  rewrapped: number;
  masterKeyVersion: number;
}

/**
 * Why the panel cannot show a status. The backend distinguishes these
 * deliberately: storage off is a configuration statement, an unreadable
 * registry is an operational fault, and they need different copy.
 */
export type EncryptionUnavailableReason =
  | "storage-disabled"
  | "registry-unavailable"
  | "forbidden"
  | "unknown";

export function unavailableReason(error: unknown): EncryptionUnavailableReason {
  if (!(error instanceof HttpError)) return "unknown";
  // 403 covers both a disabled store and a caller without the admin role, and the
  // only signal is the detail prose. Match on the two words rather than the exact
  // sentence, and fall back to a reason whose copy asserts no cause: guessing
  // "your account lacks permission" at a config problem sends the operator to the
  // wrong place entirely.
  if (error.status === 403) {
    const detail = JSON.stringify(error.body ?? "").toLowerCase();
    return detail.includes("storage") && detail.includes("disabled")
      ? "storage-disabled"
      : "forbidden";
  }
  if (error.status === 503) return "registry-unavailable";
  return "unknown";
}

/** True when the backend rejected the action because of current state, not a fault. */
export function isConflict(error: unknown): boolean {
  return error instanceof HttpError && error.status === 409;
}

/** The key row is gone, so retrying the same call cannot succeed. */
export function isMissing(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404;
}

export async function fetchEncryptionStatus(): Promise<StorageEncryptionStatus> {
  return apiClient.local.json<StorageEncryptionStatus>(`${BASE}/status`);
}

export async function disableEncryptionKey(
  keyId: string,
): Promise<EncryptionKeyInfo> {
  return apiClient.local.json<EncryptionKeyInfo>(
    `${BASE}/keys/${encodeURIComponent(keyId)}/disable`,
    { method: "POST" },
  );
}

/**
 * Reverses a revocation. Resolves to ACTIVE when the scope has no other active
 * key and RETIRED when it does, so callers must read the returned status rather
 * than assuming ACTIVE.
 */
export async function enableEncryptionKey(
  keyId: string,
): Promise<EncryptionKeyInfo> {
  return apiClient.local.json<EncryptionKeyInfo>(
    `${BASE}/keys/${encodeURIComponent(keyId)}/enable`,
    { method: "POST" },
  );
}

export async function startEncryptionMigration(): Promise<MigrationStatus> {
  return apiClient.local.json<MigrationStatus>(`${BASE}/migrate`, {
    method: "POST",
  });
}

export async function fetchMigrationStatus(): Promise<MigrationStatus> {
  return apiClient.local.json<MigrationStatus>(`${BASE}/migrate/status`);
}

export async function rotateMasterKey(): Promise<RotationResult> {
  return apiClient.local.json<RotationResult>(`${BASE}/master/rotate`, {
    method: "POST",
  });
}

/** Key rows still wrapped by an older master key version. */
export function pendingRotationCount(status: StorageEncryptionStatus): number {
  // Server-side count, not a filter over `keys`: that list is a page, and under-
  // reporting 0 pending rows is the signal an operator uses to decide the outgoing
  // master key is safe to delete.
  return status.pendingRotationRows;
}
