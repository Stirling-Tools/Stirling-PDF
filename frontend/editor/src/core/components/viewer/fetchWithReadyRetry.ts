/**
 * Repeatedly invokes a viewer-bridge fetch until it returns real data.
 *
 * The viewer bridges (bookmarks, attachments) return `null` while a document is
 * still transitioning — e.g. when switching files from the file sidebar, the
 * EmbedPDF viewer remounts (its `key` changes) and the bridge briefly
 * unregisters before the new document is ready. During that window the fetch
 * resolves to `null`.
 *
 * A `null` result must NOT be treated as "loaded, but empty": doing so caches an
 * empty success for the document and the sidebars never re-fetch, so the real
 * bookmarks/attachments stay hidden until a full reload (issue #6813). Instead
 * we retry until the bridge is ready, then return its data. If the bridge never
 * becomes ready within the budget we throw, so the caller records a recoverable
 * error (with a Retry affordance) rather than a misleading empty success.
 *
 * Transient "document not open" errors thrown by the underlying plugin are
 * retried the same way; any other error is rethrown immediately.
 */

export interface FetchWithReadyRetryOptions {
  /** Total number of attempts before giving up. */
  maxAttempts?: number;
  /** Delay between attempts, in milliseconds. */
  delayMs?: number;
  /** Classifies an error as a transient "not ready yet" error worth retrying. */
  isNotReadyError?: (error: unknown) => boolean;
}

const defaultIsNotReadyError = (error: unknown): boolean => {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error ?? "");
  return (
    message.includes("document") &&
    message.includes("not") &&
    message.includes("open")
  );
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithReadyRetry<T>(
  fetch: () => Promise<T[] | null>,
  options: FetchWithReadyRetryOptions = {},
): Promise<T[]> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 20);
  const delayMs = Math.max(0, options.delayMs ?? 50);
  const isNotReadyError = options.isNotReadyError ?? defaultIsNotReadyError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fetch();

      // `null` = bridge/document not ready yet. Retry instead of caching empty.
      if (result === null) {
        if (attempt === maxAttempts - 1) {
          throw new Error("Viewer bridge not ready");
        }
        await delay(delayMs);
        continue;
      }

      return result;
    } catch (error) {
      if (!isNotReadyError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
      await delay(delayMs);
    }
  }

  return [];
}
