import { normalizeAxiosErrorData } from "@app/services/errorUtils";

/**
 * The storage-encryption kill switch, as it reaches the browser.
 *
 * Revoking a scope's key makes reads of everything stored under it answer 403
 * with a distinctive detail (see `StorageEncryptionErrors.revoked`), from both
 * My Files and workflow document reads. It is a deliberate, reversible policy
 * state rather than a permissions failure, and it reads as a generic error
 * unless callers tell the two apart.
 */

/**
 * The detail the backend sends. Passing this to `showSpecialErrorToast` reuses
 * the one copy of the message rather than writing it a second time.
 */
export const STORAGE_KEY_REVOKED_DETAIL =
  "Access to this file has been revoked (its encryption key is disabled)";

/** Matches the backend's revocation detail. Shared so the toast table and the
 *  call sites that suppress that toast cannot drift apart. */
export const STORAGE_KEY_REVOKED_PATTERN =
  /access to this file has been revoked/i;

/**
 * True when a failed request was refused because the file's encryption key is
 * revoked. False for an ordinary permissions 403, which is a different problem
 * with a different remedy.
 *
 * Async because the file endpoints request blobs, so the error body arrives as
 * a Blob and has to be read before it can be matched.
 */
export async function isStorageKeyRevoked(error: unknown): Promise<boolean> {
  const response = (error as { response?: { status?: number; data?: unknown } })
    ?.response;
  if (response?.status !== 403) return false;

  let body: unknown;
  try {
    body = await normalizeAxiosErrorData(response.data);
  } catch {
    return false;
  }
  if (body === undefined) return false;

  const text = typeof body === "string" ? body : safeStringify(body);
  return text !== null && STORAGE_KEY_REVOKED_PATTERN.test(text);
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}
