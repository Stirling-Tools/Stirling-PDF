import posthog from "posthog-js";

const DEV = process.env.NODE_ENV === "development";

function canCapture(): boolean {
  if (typeof window === "undefined") return false;
  const ph = posthog as unknown as {
    __loaded?: boolean;
    has_opted_in_capturing?: () => boolean;
  };
  if (!ph.__loaded) return false;
  return (
    typeof ph.has_opted_in_capturing !== "function" ||
    ph.has_opted_in_capturing()
  );
}

export function trackPdfUploaded(files: File[]): void {
  try {
    if (!canCapture() || !files) return;
    for (let i = 0; i < files.length; i++) {
      posthog.capture("editor_pdf_uploaded", { source: "editor" });
    }
  } catch (error) {
    if (DEV) console.warn("[analytics] trackPdfUploaded failed", error);
  }
}

export function trackEditorOperation(toolId: string, fileCount: number): void {
  try {
    if (!canCapture()) return;
    posthog.capture("editor_operation", {
      source: "editor",
      tool: toolId,
      file_count: fileCount,
    });
  } catch (error) {
    if (DEV) console.warn("[analytics] trackEditorOperation failed", error);
  }
}

/**
 * Forward a backend-connectivity failure (no-response network error or 5xx) to
 * error tracking. These otherwise only ever surface as a toast, so error
 * tracking never sees them and their true frequency stays invisible.
 */
export function captureNetworkError(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  try {
    if (!canCapture()) return;
    const err = error instanceof Error ? error : new Error(String(error));
    posthog.captureException(err, {
      $exception_source: "backend_connectivity",
      ...context,
    });
  } catch (e) {
    if (DEV) console.warn("[analytics] captureNetworkError failed", error, e);
  }
}
