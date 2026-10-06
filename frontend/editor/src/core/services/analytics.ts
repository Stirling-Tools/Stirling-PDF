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

export type CancellationEvent =
  | "cancel_flow_opened"
  | "cancel_reason_selected"
  | "cancel_offer_clicked"
  | "cancel_confirmed"
  | "cancel_flow_abandoned"
  | "cancel_resumed";

/** Funnel for the in-app cancel flow; the reasons themselves are stored server-side. */
export function trackCancellation(
  event: CancellationEvent,
  props: Record<string, string | number | boolean | null> = {},
): void {
  try {
    if (!canCapture()) return;
    posthog.capture(event, { source: "portal", ...props });
  } catch (error) {
    if (DEV) console.warn("[analytics] trackCancellation failed", error);
  }
}
