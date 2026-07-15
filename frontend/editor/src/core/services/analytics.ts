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
 * Report a caught error to PostHog so otherwise-swallowed failures become
 * visible as `$exception` events instead of vanishing into a console.warn.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  try {
    if (!canCapture()) return;
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    posthog.captureException(normalized, context);
  } catch (captureError) {
    if (DEV) console.warn("[analytics] captureException failed", captureError);
  }
}
