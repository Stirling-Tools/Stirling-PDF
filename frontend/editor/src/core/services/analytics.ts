const DEV = process.env.NODE_ENV === "development";

// usePosthogTracking owns loading and configuring posthog-js; capture only uses
// the client that hook publishes, so nothing downloads while analytics is off.
type Posthog = typeof import("posthog-js").default;

let activePosthog: Posthog | null = null;

/** Publishes the configured client, or null while analytics is disabled. */
export function setActivePosthog(posthog: Posthog | null): void {
  activePosthog = posthog;
}

function canCapture(posthog: Posthog): boolean {
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

function capture(
  tool: string,
  event: string,
  props: Record<string, unknown>,
): void {
  const posthog = activePosthog;
  if (!posthog || !canCapture(posthog)) return;
  try {
    posthog.capture(event, props);
  } catch (error) {
    if (DEV) console.warn(`[analytics] ${tool} failed`, error);
  }
}

export function trackPdfUploaded(files: File[]): void {
  if (!files) return;
  for (let i = 0; i < files.length; i++) {
    capture("trackPdfUploaded", "editor_pdf_uploaded", { source: "editor" });
  }
}

export function trackEditorOperation(toolId: string, fileCount: number): void {
  capture("trackEditorOperation", "editor_operation", {
    source: "editor",
    tool: toolId,
    file_count: fileCount,
  });
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
