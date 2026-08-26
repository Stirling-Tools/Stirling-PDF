import apiClient from "@app/services/apiClient";

/**
 * Reports a tool failure the user hit in the editor, so it lands in the same queue
 * as one from a folder or bucket. The editor calls tools directly, so nothing
 * server-side knows about these unless the client says so.
 *
 * Best-effort throughout: a build without the failure registry has no such route,
 * and a report failing must never disturb the tool's own error handling.
 */

const REPORT_PATH = "/api/v1/file-run-events/reports";
const REMOVED_FILES_PATH = "/api/v1/file-run-events/removed-files";

interface ToolFailureReport {
  /** The tool that failed, e.g. `remove-password`. */
  operation: string;
  /** Whatever the tool call rejected with. */
  error: unknown;
  /** Opaque file ids from FileContext. Names are deliberately not accepted. */
  fileIds?: string[];
  /**
   * Accepted and ignored, so a call site that has names on hand cannot pass them
   * somewhere they would be stored. Present to make that explicit rather than to
   * be used.
   */
  fileNames?: string[];
}

/**
 * The `errorCode` from a tool's Problem Details response, or null when there is
 * none. A download-typed call fails with a Blob body, so that shape is parsed too.
 */
export async function errorCodeOf(error: unknown): Promise<string | null> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!data) return null;

  const body = await asJson(data);
  const code = (body as { errorCode?: unknown })?.errorCode;
  return typeof code === "string" && code.trim() !== "" ? code : null;
}

async function asJson(data: unknown): Promise<unknown> {
  if (typeof data === "object" && data !== null && !isBlobLike(data)) {
    return data;
  }
  try {
    const text = isBlobLike(data)
      ? await data.text()
      : typeof data === "string"
        ? data
        : "";
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function isBlobLike(value: unknown): value is { text: () => Promise<string> } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { text?: unknown }).text === "function"
  );
}

export async function reportToolFailure({
  operation,
  error,
  fileIds = [],
}: ToolFailureReport): Promise<void> {
  if (!operation || operation.trim() === "") return;
  if (wasCancelled(error)) return;

  try {
    await apiClient.post(
      REPORT_PATH,
      {
        operation,
        errorCode: await errorCodeOf(error),
        fileIds,
        detail: messageOf(error),
      },
      // The reporter's own failure must not reach the user: they already have the
      // tool's error on screen, and a second toast about the report would be noise
      // about something they never asked for.
      { suppressErrorToast: true },
    );
  } catch (reportError) {
    // Still never rethrown: a core build has no such route, and a member's report can
    // also be refused. But a report the server rejected as invalid is logged rather
    // than lost, because nothing else would ever surface it.
    warnIfRejected(operation, reportError);
  }
}

/**
 * A report the server refused as malformed, which means this client built a bad one: worth a
 * line in the console for whoever wrote it, since the call is fire-and-forget and its toast is
 * suppressed. An absent route (404, a core build) or a session not allowed to report are
 * expected, and stay quiet so an ordinary build does not log on every tool failure.
 */
function warnIfRejected(operation: string, error: unknown): void {
  const response = (error as { response?: { status?: number; data?: unknown } })
    ?.response;
  if (response?.status !== 400) return;

  console.warn(
    `Failure report for "${operation}" was rejected by the server: ${reasonOf(response.data)}`,
  );
}

/** Whatever the server said, out of a Problem Details body. */
function reasonOf(data: unknown): string {
  const body = data as { detail?: unknown; message?: unknown };
  const stated =
    typeof body?.detail === "string"
      ? body.detail
      : typeof body?.message === "string"
        ? body.message
        : "";
  return stated.trim() === "" ? "no reason given" : stated;
}

/**
 * Tell the server a user deleted these files, so any failure recorded against them stops asking
 * for attention. The rows stay for audit; they just leave the queue.
 *
 * <p>Best-effort like the reporter: a build without the failure registry has no such route, and
 * deleting a file must not fail because the server could not be told.
 */
export async function reportFilesRemoved(fileIds: string[]): Promise<void> {
  const named = fileIds.filter(
    (id) => typeof id === "string" && id.trim() !== "",
  );
  if (named.length === 0) return;

  try {
    // Toast suppressed for the same reason as a report: the user deleted a file and is not
    // waiting to hear whether the server was told.
    await apiClient.post(
      REMOVED_FILES_PATH,
      { fileIds: named },
      { suppressErrorToast: true },
    );
  } catch {
    // The file is gone locally either way. A row left open is retention's problem.
  }
}

/**
 * The message the user saw, sent as-is. It is their own error about their own file, so hiding
 * parts of it would only make the row harder to act on.
 */
function messageOf(error: unknown): string {
  const candidate = error as { message?: unknown };
  return typeof candidate?.message === "string" ? candidate.message : "";
}

/**
 * A user cancelling is the one failure worth dropping: nothing went wrong and there
 * is nothing for a reviewer to do. `useToolApiCalls` rethrows an axios cancellation
 * as a plain Error with the original as its cause, so both shapes are checked.
 *
 * <p>Everything else is reported, client-side refusals included: an unsupported input
 * format is the same class of problem as the processor rejecting a file type, which
 * is already recorded.
 *
 * <p>Exported so a run the user cancelled does not get a retry stashed for it.
 */
export function wasCancelled(error: unknown): boolean {
  const candidate = error as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
    cause?: { code?: unknown; name?: unknown };
  };
  return (
    candidate?.code === "ERR_CANCELED" ||
    candidate?.cause?.code === "ERR_CANCELED" ||
    candidate?.name === "CanceledError" ||
    candidate?.cause?.name === "CanceledError" ||
    candidate?.message === "Operation was cancelled"
  );
}
