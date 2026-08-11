import { apiClient, HttpError } from "@portal/api/http";

/**
 * Admin API for storage encryption at rest. Mirrors the Spring surface added in
 * PR #7173 (`/api/v1/admin/storage-encryption`), which is admin-only and never
 * accepts or returns key material.
 */

const BASE = "/api/v1/admin/storage-encryption";

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
  masterKeySource?: MasterKeySource;
  encryptedFiles: number;
  plaintextFiles: number;
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
  // 403 covers both storage-disabled and a non-admin caller. The backend sends
  // "Storage is disabled" as the detail for the former.
  if (error.status === 403) {
    const detail = JSON.stringify(error.body ?? "").toLowerCase();
    return detail.includes("storage is disabled")
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
  if (status.masterKeyVersion === null) return 0;
  const current = status.masterKeyVersion;
  return status.keys.filter((k) => k.masterKeyVersion < current).length;
}
